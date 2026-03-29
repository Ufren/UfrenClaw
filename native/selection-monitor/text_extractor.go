package main

import (
	"log"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
)

// TextExtractor 智能文本提取器
// 根据不同的应用程序类型选择最优的文本获取方式
type TextExtractor struct {
	clipboardExtractor *ClipboardExtractor
	// 未来可以添加：uiAutomationExtractor *UIAutomationExtractor
}

// ClipboardExtractor 改进的剪贴板提取器
type ClipboardExtractor struct {
	lastClipboard        string
	restoreDelay         time.Duration
	userPressedCtrlCFunc func() bool // 检查用户是否按了 Ctrl+C
}

// NewTextExtractor 创建文本提取器
func NewTextExtractor() *TextExtractor {
	return &TextExtractor{
		clipboardExtractor: &ClipboardExtractor{
			restoreDelay: 500 * time.Millisecond, // 500ms延迟，避免影响用户操作
			userPressedCtrlCFunc: getUserPressedCtrlC, // 绑定检查函数
		},
	}
}

// getUserPressedCtrlC 检查用户是否按了 Ctrl+C（从 main.go 获取）
func getUserPressedCtrlC() bool {
	return userPressedCtrlC
}

// GetSelectedText 智能获取选中文本
func (t *TextExtractor) GetSelectedText(hwnd win.HWND) string {
	// 方案1: 尝试使用SendMessage获取编辑框文本（无剪贴板污染）
	text := t.tryGetEditText(hwnd)
	if text != "" {
		return text
	}

	// 方案2: 使用改进的剪贴板方案
	text = t.clipboardExtractor.GetSelectedText()
	if text != "" {
		return text
	}

	return ""
}

// tryGetEditText 尝试使用SendMessage获取编辑框文本
// 适用于：记事本、Notepad++、VSCode等原生编辑器
func (t *TextExtractor) tryGetEditText(hwnd win.HWND) string {
	// 获取窗口类名
	className := getWindowClass(hwnd)
	
	// 检查是否是编辑框
	if !isEditControl(className) {
		// 尝试查找子编辑框
		hwnd = findEditControl(hwnd)
		if hwnd == 0 {
			return ""
		}
	}

	// 获取选中范围
	var start, end uint32
	win.SendMessage(hwnd, win.EM_GETSEL, uintptr(unsafe.Pointer(&start)), uintptr(unsafe.Pointer(&end)))

	if start == end {
		// 没有选中内容
		return ""
	}

	// 获取文本长度
	textLen := win.SendMessage(hwnd, win.WM_GETTEXTLENGTH, 0, 0)
	if textLen == 0 || textLen > 100000 {
		// 文本为空或过长
		return ""
	}

	// 分配缓冲区
	buf := make([]uint16, textLen+1)

	// 获取全部文本
	ret := win.SendMessage(hwnd, win.WM_GETTEXT, uintptr(len(buf)), uintptr(unsafe.Pointer(&buf[0])))
	if ret == 0 {
		return ""
	}

	// 转换为字符串
	fullText := syscall.UTF16ToString(buf)

	// 提取选中部分
	runes := []rune(fullText)
	if int(end) > len(runes) {
		end = uint32(len(runes))
	}

	selectedText := string(runes[start:end])
	return selectedText
}

// GetSelectedText 改进的剪贴板获取方法
// 策略：使用键盘钩子检测真实的 Ctrl+C，完全不干扰系统功能
func (c *ClipboardExtractor) GetSelectedText() string {
	// 1. 保存当前剪贴板内容
	oldClipboard := ""
	for i := 0; i < 3; i++ {
		oldClipboard = getClipboardText()
		if oldClipboard != "" || i == 2 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	c.lastClipboard = oldClipboard

	// 2. 模拟 Ctrl+C 获取选中文本
	simulateCtrlC()

	// 3. 等待剪贴板更新
	time.Sleep(80 * time.Millisecond)

	// 4. 读取新内容
	text := getClipboardText()

	// 5. 智能恢复策略：
	// - 使用键盘钩子检测用户是否真的按了 Ctrl+C
	// - 如果检测到用户操作，不恢复剪贴板，尊重用户的复制操作
	// - 否则立即恢复，避免污染剪贴板
	
	// 启动后台监测任务
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[剪贴板] 恢复过程panic: %v", r)
			}
		}()

		initialClipboard := text
		startTime := time.Now()
		maxWait := 5000 * time.Millisecond // 监测5秒
		checkInterval := 100 * time.Millisecond // 每100ms检查一次
		
		// 持续监测用户操作
		for time.Since(startTime) < maxWait {
			time.Sleep(checkInterval)
			
			// 检查用户是否按了 Ctrl+C
			if c.userPressedCtrlCFunc != nil && c.userPressedCtrlCFunc() {
				return
			}
			
			// 检查剪贴板是否被用户修改
			currentClipboard := getClipboardText()
			if currentClipboard != initialClipboard {
				return
			}
		}
		
		// 超时后，最终确认
		time.Sleep(50 * time.Millisecond)
		finalClipboard := getClipboardText()
		if finalClipboard != initialClipboard {
			return
		}
		
		// 恢复原剪贴板（带验证和重试）
		for i := 0; i < 3; i++ {
			setClipboardText(oldClipboard)
			time.Sleep(10 * time.Millisecond)
			
			if getClipboardText() == oldClipboard {
				return
			}

			if i < 2 {
				time.Sleep(50 * time.Millisecond)
			}
		}
	}()

	// 6. 检查是否获取到新文本
	if text == "" || text == oldClipboard {
		return ""
	}

	return text
}

// getWindowClass 获取窗口类名
func getWindowClass(hwnd win.HWND) string {
	buf := make([]uint16, 256)
	win.GetClassName(hwnd, &buf[0], len(buf))
	return syscall.UTF16ToString(buf)
}

// isEditControl 检查是否是编辑框控件
func isEditControl(className string) bool {
	className = strings.ToLower(className)
	// 常见的编辑框类名
	editClasses := []string{
		"edit",           // 标准编辑框
		"richedit",       // Rich Edit控件
		"richedit20a",    // Rich Edit 2.0
		"richedit20w",
		"richedit50w",
		"scintilla",      // Notepad++等使用的编辑器
		"vscodecontentcontrol", // VSCode
	}

	for _, class := range editClasses {
		if strings.Contains(className, class) {
			return true
		}
	}

	return false
}

// findEditControl 查找窗口中的编辑框控件
func findEditControl(hwnd win.HWND) win.HWND {
	var editHwnd win.HWND

	// 枚举子窗口查找编辑框
	callback := syscall.NewCallback(func(h win.HWND, lParam uintptr) uintptr {
		className := getWindowClass(h)
		if isEditControl(className) {
			// 检查是否可见
			if win.IsWindowVisible(h) {
				editHwnd = h
				return 0 // 停止枚举
			}
		}
		return 1 // 继续枚举
	})

	win.EnumChildWindows(hwnd, callback, 0)

	return editHwnd
}

// 性能统计
type ExtractionStats struct {
	SendMessageSuccess int
	ClipboardSuccess   int
	TotalAttempts      int
}

var stats ExtractionStats

// GetStats 获取统计信息
func (t *TextExtractor) GetStats() ExtractionStats {
	return stats
}

// LogStats 输出统计信息
func (t *TextExtractor) LogStats() {
	if stats.TotalAttempts > 0 {
		sendMsgRate := float64(stats.SendMessageSuccess) / float64(stats.TotalAttempts) * 100
		clipboardRate := float64(stats.ClipboardSuccess) / float64(stats.TotalAttempts) * 100

		log.Printf("[统计] 总尝试: %d | SendMessage成功率: %.1f%% | 剪贴板成功率: %.1f%%",
			stats.TotalAttempts, sendMsgRate, clipboardRate)
	}
}

