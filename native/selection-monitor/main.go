package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
)

// Windows Hook 常量定义
const (
	WH_MOUSE_LL    = 14 // 低级鼠标Hook
	WH_KEYBOARD_LL = 13 // 低级键盘Hook
)

// Windows 类型定义
type HHOOK uintptr

var (
	lastText           = ""
	lastTextTime       time.Time // 上次检测到文本的时间
	mouseHook          HHOOK
	keyboardHook       HHOOK
	isMouseDown        = false
	mouseDownPos       win.POINT // 鼠标按下的位置
	mouseUpPos         win.POINT // 鼠标释放的位置
	lastCheckTime      time.Time
	lastClickTime      time.Time // 上次单击时间，用于检测双击
	lastClickPos       win.POINT // 上次点击的位置，用于验证双击
	clickCount         = 0       // 连续点击次数
	userPressedCtrlC   = false   // 用户是否按了 Ctrl+C
	programSimulating  = false   // 程序是否正在模拟按键（避免误判）

	// DLL
	user32 = syscall.NewLazyDLL("user32.dll")

	// 函数
	setWindowsHookEx    = user32.NewProc("SetWindowsHookExW")
	unhookWindowsHookEx = user32.NewProc("UnhookWindowsHookEx")
	callNextHookEx      = user32.NewProc("CallNextHookEx")
	getWindowTextW      = user32.NewProc("GetWindowTextW")
	getAsyncKeyState    = user32.NewProc("GetAsyncKeyState")

	// 文本提取器
	textExtractor = NewTextExtractor()
)

func main() {
	// 捕获主程序panic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[致命错误] 主程序崩溃: %v\n", r)
			time.Sleep(10 * time.Second) // 延迟退出，让用户看到错误
			os.Exit(1)
		}
	}()

	// 日志到stderr
	log.SetOutput(os.Stderr)
	log.Println("=== Ufren 划词监听器 v1.0 启动 ===")

	// 安装鼠标Hook
	if err := installMouseHook(); err != nil {
		log.Fatalf("[错误] 安装鼠标Hook失败: %v", err)
	}
	defer uninstallMouseHook()

	// 安装键盘Hook（监听 Ctrl+C）
	if err := installKeyboardHook(); err != nil {
		log.Fatalf("[错误] 安装键盘Hook失败: %v", err)
	}
	defer uninstallKeyboardHook()

	log.Println("[就绪] 监听运行中...")

	// 启动统计信息定时输出（可选，用于调试）
	// go func() {
	// 	ticker := time.NewTicker(30 * time.Minute)
	// 	defer ticker.Stop()
	// 	
	// 	for range ticker.C {
	// 		textExtractor.LogStats()
	// 	}
	// }()

	// Windows消息循环（必须，否则Hook不工作）
	var msg win.MSG
	for win.GetMessage(&msg, 0, 0, 0) > 0 {
		win.TranslateMessage(&msg)
		win.DispatchMessage(&msg)
	}
}

// installMouseHook 安装全局鼠标Hook
func installMouseHook() error {
	// 创建Hook回调
	callback := syscall.NewCallback(mouseProc)

	ret, _, err := setWindowsHookEx.Call(
		uintptr(WH_MOUSE_LL), // 低级鼠标Hook
		callback,
		0,
		0,
	)

	if ret == 0 {
		return err
	}

	return nil
}

// uninstallMouseHook 卸载鼠标Hook
func uninstallMouseHook() {
	if mouseHook != 0 {
		unhookWindowsHookEx.Call(uintptr(mouseHook))
	}
}

// installKeyboardHook 安装全局键盘Hook
func installKeyboardHook() error {
	// 创建Hook回调
	callback := syscall.NewCallback(keyboardProc)

	ret, _, err := setWindowsHookEx.Call(
		uintptr(WH_KEYBOARD_LL), // 低级键盘Hook
		callback,
		0,
		0,
	)

	if ret == 0 {
		return err
	}

	keyboardHook = HHOOK(ret)
	return nil
}

// uninstallKeyboardHook 卸载键盘Hook
func uninstallKeyboardHook() {
	if keyboardHook != 0 {
		unhookWindowsHookEx.Call(uintptr(keyboardHook))
	}
}

// keyboardProc 键盘Hook回调函数
func keyboardProc(nCode int, wParam uintptr, lParam uintptr) uintptr {
	const (
		WM_KEYDOWN    = 0x0100
		WM_SYSKEYDOWN = 0x0104
		VK_C          = 0x43
		VK_CONTROL    = 0x11
	)

	if nCode >= 0 && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) {
		// 获取按键信息
		kbdStruct := (*struct {
			vkCode      uint32
			scanCode    uint32
			flags       uint32
			time        uint32
			dwExtraInfo uintptr
		})(unsafe.Pointer(lParam))

		// 检测 C 键按下
		if kbdStruct.vkCode == VK_C {
			// 检查 Ctrl 键是否按下
			ctrlState, _, _ := getAsyncKeyState.Call(uintptr(VK_CONTROL))
			if ctrlState&0x8000 != 0 {
				// ✅ 区分程序模拟和用户真实操作
				if programSimulating {
					// 程序正在模拟，不是用户操作，不打印日志
					// log.Println("[键盘] 程序模拟的 Ctrl+C（内部使用）")
				} else {
					// 用户真实按下了 Ctrl+C
					userPressedCtrlC = true
					
					// 设置一个定时器，3秒后重置标志
					go func() {
						time.Sleep(3 * time.Second)
						userPressedCtrlC = false
					}()
				}
			}
		}
	}

	// 调用下一个Hook
	ret, _, _ := callNextHookEx.Call(
		uintptr(keyboardHook),
		uintptr(nCode),
		wParam,
		lParam,
	)
	return ret
}

// mouseProc 鼠标Hook回调函数
func mouseProc(nCode int, wParam uintptr, lParam uintptr) uintptr {
	if nCode >= 0 {
		switch wParam {
		case win.WM_LBUTTONDOWN:
			// 鼠标左键按下 - 记录位置
			isMouseDown = true
			win.GetCursorPos(&mouseDownPos)

			// 检测是否是双击（500ms内的第二次点击，且位置接近）
			now := time.Now()

			// 计算与上次点击位置的距离
			dx := mouseDownPos.X - lastClickPos.X
			dy := mouseDownPos.Y - lastClickPos.Y
			distanceFromLastClick := dx*dx + dy*dy

			// 只有时间和位置都满足条件才算双击
			// 时间：500ms内
			// 位置：距离上次点击位置小于20像素（400 = 20*20）
			if now.Sub(lastClickTime) < 500*time.Millisecond && distanceFromLastClick < 400 {
				clickCount++
			} else {
				clickCount = 1
			}

			lastClickTime = now
			lastClickPos = mouseDownPos

		case win.WM_LBUTTONUP:
			// 鼠标左键释放
			if isMouseDown {
				isMouseDown = false

				// 获取释放位置（保存到全局变量）
				win.GetCursorPos(&mouseUpPos)

				// 计算移动距离
				dx := mouseUpPos.X - mouseDownPos.X
				dy := mouseUpPos.Y - mouseDownPos.Y
				distance := dx*dx + dy*dy

				// 判断操作类型
				if distance > 100 {
					// 情况1：拖动选择（移动距离大）
					// 快速响应：立即检测选中文本
					lastCheckTime = time.Now()
					go func() {
						time.Sleep(50 * time.Millisecond) // 减少延迟，快速响应
						checkSelection()
					}()

				} else if distance < 10 && clickCount >= 2 {
					// 情况2：双击选择（移动距离小，且是第二次点击）
					// 快速响应：立即检测选中文本
					lastCheckTime = time.Now()
					go func() {
						time.Sleep(80 * time.Millisecond) // 双击需要稍长等待时间，让选择完成
						checkSelection()
					}()

					// 重置点击计数
					clickCount = 0

				} else if distance < 10 && clickCount == 1 {
					// 情况3：单击（移动距离小，第一次点击）
					// 只清除之前的选择状态，不主动检测新内容
					if lastText != "" {
						go func() {
							time.Sleep(100 * time.Millisecond)

							// 检查是否点击了划词助手窗口
							hwnd := win.GetForegroundWindow()
							if hwnd == 0 {
								return
							}

							windowTitle := getWindowTitle(hwnd)

							// 如果点击的不是划词助手窗口，清除选择状态
							if windowTitle != "划词工具栏" && windowTitle != "划词助手面板" && windowTitle != "划词助手" {
								lastText = ""
								lastTextTime = time.Time{} // 重置时间，允许下次选择相同文本
								sendClearEvent()
							}
						}()
					}
				}
			}

		case win.WM_LBUTTONDBLCLK:
			// 系统双击事件（备用检测）
			clickCount = 2
		}
	}

	// 调用下一个Hook
	ret, _, _ := callNextHookEx.Call(
		uintptr(mouseHook),
		uintptr(nCode),
		wParam,
		lParam,
	)
	return ret
}

// checkSelection 检查选中的文本（使用智能文本提取器）
func checkSelection() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[错误] 检查文本panic: %v\n", r)
		}
	}()

	// 获取当前前台窗口
	hwnd := win.GetForegroundWindow()
	if hwnd == 0 {
		return
	}

	// 获取窗口标题，过滤划词助手自己的窗口
	windowTitle := getWindowTitle(hwnd)

	// 忽略划词助手的窗口（工具栏、面板和统一窗口）
	if windowTitle == "划词工具栏" || windowTitle == "划词助手面板" || windowTitle == "划词助手" {
		// log.Println("[过滤] 忽略划词助手自己的窗口")
		return
	}

	// 使用智能文本提取器获取选中文本
	// 优先尝试SendMessage（无剪贴板污染），失败后fallback到剪贴板方案
	text := textExtractor.GetSelectedText(hwnd)

	// 检查是否成功获取文本
	if text == "" {
		return
	}

	// 至少2个字符
	if len([]rune(text)) < 2 {
		return
	}

	// ✅ 更新最后检测的文本（用于单击清除状态判断）
	lastText = text
	lastTextTime = time.Now()

	// ✅ 计算选中文本的实际边界
	// 使用记录的鼠标按下和释放位置来计算文本边界
	var textBounds struct {
		left   int32
		top    int32
		right  int32
		bottom int32
		centerX int32
		centerY int32
	}
	
	// 确定文本的左右边界（考虑从左到右和从右到左的选择）
	if mouseDownPos.X < mouseUpPos.X {
		textBounds.left = mouseDownPos.X
		textBounds.right = mouseUpPos.X
	} else {
		textBounds.left = mouseUpPos.X
		textBounds.right = mouseDownPos.X
	}
	
	// 确定文本的上下边界
	if mouseDownPos.Y < mouseUpPos.Y {
		textBounds.top = mouseDownPos.Y
		textBounds.bottom = mouseUpPos.Y
	} else {
		textBounds.top = mouseUpPos.Y
		textBounds.bottom = mouseDownPos.Y
	}
	
	// ✅ 特殊处理：双击选择时，鼠标位置基本不动，需要估算文本边界
	// 双击选择通常是一个词，根据文本长度估算宽度
	width := textBounds.right - textBounds.left
	height := textBounds.bottom - textBounds.top
	
	if width < 10 && height < 10 {
		// 双击或位置信息不准确的情况
		// 估算：假设平均字符宽度为8px，行高为20px
		textLength := len([]rune(text))
		estimatedWidth := int32(textLength * 8)
		
		// 使用鼠标位置作为参考点，向左右扩展
		var currentPos win.POINT
		win.GetCursorPos(&currentPos)
		
		textBounds.left = currentPos.X - estimatedWidth/2
		textBounds.right = currentPos.X + estimatedWidth/2
		textBounds.top = currentPos.Y - 10   // 假设行高20px，文本中心在鼠标上方10px
		textBounds.bottom = currentPos.Y + 10
	}
	
	// ✅ 确保bottom是真正的文本底部
	// 鼠标拖动的位置可能在文本中间，增加少量安全边距确保不覆盖
	// 典型行高15-20px，我们只需很小的安全边距即可
	// 主要间距由TypeScript侧控制，这里只确保超过文本底部
	safetyMargin := int32(5) // 最小安全边距
	textBounds.bottom += safetyMargin
	
	// 计算文本的中心位置
	textBounds.centerX = (textBounds.left + textBounds.right) / 2
	textBounds.centerY = (textBounds.top + textBounds.bottom) / 2

	log.Printf("[选中] %s [%s]\n", truncate(text, 30), windowTitle)

	// 发送事件（传递文本边界信息）
	sendEvent(text, textBounds)
}

// getWindowTitle 获取窗口标题
func getWindowTitle(hwnd win.HWND) string {
	var buf [256]uint16
	ret, _, _ := getWindowTextW.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&buf[0])),
		256,
	)

	if ret == 0 {
		return ""
	}

	return syscall.UTF16ToString(buf[:])
}

// simulateCtrlC 模拟 Ctrl+C 按键
func simulateCtrlC() {
	// ✅ 设置标志，防止键盘Hook误判为用户操作
	programSimulating = true
	defer func() {
		// 延迟重置，确保Hook能检测到这个标志
		time.Sleep(50 * time.Millisecond)
		programSimulating = false
	}()
	
	// Ctrl down
	keybd_event(win.VK_CONTROL, 0, 0, 0)
	time.Sleep(10 * time.Millisecond)

	// C down
	keybd_event('C', 0, 0, 0)
	time.Sleep(10 * time.Millisecond)

	// C up
	keybd_event('C', 0, win.KEYEVENTF_KEYUP, 0)
	time.Sleep(10 * time.Millisecond)

	// Ctrl up
	keybd_event(win.VK_CONTROL, 0, win.KEYEVENTF_KEYUP, 0)
}

// keybd_event Windows按键事件
func keybd_event(vk byte, scan byte, flags uint32, extraInfo uintptr) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("keybd_event")
	proc.Call(
		uintptr(vk),
		uintptr(scan),
		uintptr(flags),
		extraInfo,
	)
}

// setClipboardText 设置剪贴板文本
func setClipboardText(text string) {
	if !win.OpenClipboard(0) {
		return
	}
	defer win.CloseClipboard()

	win.EmptyClipboard()

	if text == "" {
		return
	}

	utf16, _ := syscall.UTF16FromString(text)
	h := win.GlobalAlloc(win.GMEM_MOVEABLE, uintptr(len(utf16)*2))
	if h == 0 {
		return
	}

	p := win.GlobalLock(h)
	if p == nil {
		return
	}

	copy((*[1 << 20]uint16)(unsafe.Pointer(p))[:], utf16)
	win.GlobalUnlock(h)

	win.SetClipboardData(win.CF_UNICODETEXT, win.HANDLE(h))
}

// getClipboardText 获取剪贴板文本
func getClipboardText() string {
	if !win.OpenClipboard(0) {
		return ""
	}
	defer win.CloseClipboard()

	h := win.GetClipboardData(win.CF_UNICODETEXT)
	if h == 0 {
		return ""
	}

	p := win.GlobalLock(win.HGLOBAL(h))
	if p == nil {
		return ""
	}
	defer win.GlobalUnlock(win.HGLOBAL(h))

	return syscall.UTF16ToString((*[1 << 20]uint16)(unsafe.Pointer(p))[:])
}

// sendEvent 发送事件到stdout（包含文本边界信息）
func sendEvent(text string, bounds struct {
	left    int32
	top     int32
	right   int32
	bottom  int32
	centerX int32
	centerY int32
}) {
	event := map[string]interface{}{
		"type": "text-selected",
		"text": text,
		// ✅ 传递文本边界的中心位置（用于定位划词窗口）
		"x": int(bounds.centerX),
		"y": int(bounds.bottom), // Y使用底部位置，让工具栏出现在文本下方
		// ✅ 传递完整的边界信息（可选，供未来优化使用）
		"bounds": map[string]int{
			"left":   int(bounds.left),
			"top":    int(bounds.top),
			"right":  int(bounds.right),
			"bottom": int(bounds.bottom),
			"centerX": int(bounds.centerX),
			"centerY": int(bounds.centerY),
		},
	}

	data, err := json.Marshal(event)
	if err != nil {
		log.Println("[错误] JSON序列化失败:", err)
		return
	}

	fmt.Println(string(data))
}

// sendClearEvent 发送取消选择事件到stdout
func sendClearEvent() {
	event := map[string]interface{}{
		"type": "selection-cleared",
	}

	data, err := json.Marshal(event)
	if err != nil {
		log.Println("[错误] JSON序列化失败:", err)
		return
	}

	fmt.Println(string(data))
}

// truncate 截断文本
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}
