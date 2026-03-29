package monitor

import (
	"log"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
)

// TextSelectionMonitor 文本选择监听器
type TextSelectionMonitor struct {
	running       bool
	lastText      string
	callback      func(text string, x, y int)
	stopChan      chan struct{}
}

// NewTextSelectionMonitor 创建文本选择监听器
func NewTextSelectionMonitor() (*TextSelectionMonitor, error) {
	return &TextSelectionMonitor{
		running:  false,
		stopChan: make(chan struct{}),
	}, nil
}

// OnTextSelected 设置文本选中回调
func (m *TextSelectionMonitor) OnTextSelected(callback func(text string, x, y int)) {
	m.callback = callback
}

// Start 启动监听器
func (m *TextSelectionMonitor) Start() error {
	if m.running {
		return nil
	}

	m.running = true
	
	// 启动监听协程
	go m.monitorLoop()
	
	log.Println("[监听器] 开始监听文本选择...")
	return nil
}

// monitorLoop 监听循环
func (m *TextSelectionMonitor) monitorLoop() {
	// 捕获goroutine中的panic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[错误] 监听循环panic: %v\n", r)
		}
	}()

	ticker := time.NewTicker(200 * time.Millisecond) // 每200ms检查一次
	defer ticker.Stop()

	log.Println("[监听器] 监听循环已启动")

	for {
		select {
		case <-m.stopChan:
			log.Println("[监听器] 停止监听")
			return
		case <-ticker.C:
			// 捕获checkSelection中的panic
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[错误] checkSelection panic: %v\n", r)
					}
				}()
				m.checkSelection()
			}()
		}
	}
}

// checkSelection 检查当前是否有文本被选中
func (m *TextSelectionMonitor) checkSelection() {
	// 获取前台窗口
	hwnd := win.GetForegroundWindow()
	if hwnd == 0 {
		return
	}

	// 尝试获取选中的文本
	text := m.getSelectedTextFromWindow(hwnd)
	
	// 调试：显示检测到的文本（即使为空）
	// log.Printf("[调试] 检测到文本: '%s', 上次: '%s'\n", text, m.lastText)
	
	// 如果文本为空或与上次相同，忽略
	if text == "" || text == m.lastText {
		return
	}

	// 文本长度至少2个字符
	textRunes := []rune(text)
	if len(textRunes) < 2 {
		log.Printf("[忽略] 文本太短: '%s' (长度: %d)\n", text, len(textRunes))
		return
	}

	m.lastText = text
	log.Printf("[检测] 新文本选择: '%s' (长度: %d)\n", truncateText(text, 30), len(textRunes))

	// 获取鼠标位置
	var pt win.POINT
	win.GetCursorPos(&pt)

	// 调用回调
	if m.callback != nil {
		m.callback(text, int(pt.X), int(pt.Y))
	}
}

// truncateText 截断文本用于日志
func truncateText(text string, maxLen int) string {
	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}
	return string(runes[:maxLen]) + "..."
}

// getSelectedTextFromWindow 从窗口获取选中文本
func (m *TextSelectionMonitor) getSelectedTextFromWindow(hwnd win.HWND) string {
	// 方法1: 模拟 Ctrl+C 获取剪贴板
	// 这是最通用的方法，几乎所有应用都支持
	
	// 保存当前剪贴板内容
	oldClipboard := m.getClipboardText()
	
	// 清空剪贴板
	m.clearClipboard()
	
	// 模拟 Ctrl+C
	m.sendCtrlC(hwnd)
	
	// 等待剪贴板更新
	time.Sleep(50 * time.Millisecond)
	
	// 读取新的剪贴板内容
	newText := m.getClipboardText()
	
	// 恢复原剪贴板内容
	m.setClipboardText(oldClipboard)
	
	return newText
}

// getClipboardText 获取剪贴板文本
func (m *TextSelectionMonitor) getClipboardText() string {
	if !win.OpenClipboard(0) {
		return ""
	}
	defer win.CloseClipboard()

	handle := win.GetClipboardData(win.CF_UNICODETEXT)
	if handle == 0 {
		return ""
	}

	ptr := win.GlobalLock(win.HGLOBAL(handle))
	if ptr == nil {
		return ""
	}
	defer win.GlobalUnlock(win.HGLOBAL(handle))

	return syscall.UTF16ToString((*[1 << 20]uint16)(unsafe.Pointer(ptr))[:])
}

// setClipboardText 设置剪贴板文本
func (m *TextSelectionMonitor) setClipboardText(text string) {
	if !win.OpenClipboard(0) {
		return
	}
	defer win.CloseClipboard()

	win.EmptyClipboard()

	if text == "" {
		return
	}

	utf16, _ := syscall.UTF16FromString(text)
	handle := win.GlobalAlloc(win.GMEM_MOVEABLE, uintptr(len(utf16)*2))
	if handle == 0 {
		return
	}

	ptr := win.GlobalLock(handle)
	if ptr == nil {
		return
	}

	copy((*[1 << 20]uint16)(unsafe.Pointer(ptr))[:], utf16)
	win.GlobalUnlock(handle)

	win.SetClipboardData(win.CF_UNICODETEXT, win.HANDLE(handle))
}

// clearClipboard 清空剪贴板
func (m *TextSelectionMonitor) clearClipboard() {
	if !win.OpenClipboard(0) {
		return
	}
	defer win.CloseClipboard()
	win.EmptyClipboard()
}

// sendCtrlC 发送Ctrl+C到窗口
func (m *TextSelectionMonitor) sendCtrlC(hwnd win.HWND) {
	// 保存当前活动窗口
	currentHwnd := win.GetForegroundWindow()
	
	// 激活目标窗口
	win.SetForegroundWindow(hwnd)
	time.Sleep(10 * time.Millisecond)
	
	// 模拟 Ctrl down
	keybd_event(win.VK_CONTROL, 0, 0, 0)
	time.Sleep(5 * time.Millisecond)
	
	// 模拟 C down
	keybd_event('C', 0, 0, 0)
	time.Sleep(5 * time.Millisecond)
	
	// 模拟 C up
	keybd_event('C', 0, win.KEYEVENTF_KEYUP, 0)
	time.Sleep(5 * time.Millisecond)
	
	// 模拟 Ctrl up
	keybd_event(win.VK_CONTROL, 0, win.KEYEVENTF_KEYUP, 0)
	
	// 恢复原窗口
	time.Sleep(10 * time.Millisecond)
	win.SetForegroundWindow(currentHwnd)
}

// keybd_event 键盘事件
func keybd_event(vk byte, scan byte, flags uint32, extraInfo uintptr) {
	user32 := syscall.NewLazyDLL("user32.dll")
	keybd := user32.NewProc("keybd_event")
	keybd.Call(
		uintptr(vk),
		uintptr(scan),
		uintptr(flags),
		extraInfo,
	)
}

// Stop 停止监听
func (m *TextSelectionMonitor) Stop() {
	if !m.running {
		return
	}
	
	m.running = false
	close(m.stopChan)
}

// Close 关闭监听器
func (m *TextSelectionMonitor) Close() {
	m.Stop()
}

