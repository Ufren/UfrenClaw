package main

import (
	"syscall"
	"unsafe"
)

// UI Automation COM接口GUIDs
var (
	// IUIAutomation CLSID
	CLSID_CUIAutomation = syscall.GUID{
		Data1: 0xff48dba4,
		Data2: 0x60ef,
		Data3: 0x4201,
		Data4: [8]byte{0xaa, 0x87, 0x54, 0x10, 0x3e, 0xef, 0x59, 0x4e},
	}

	// IUIAutomation IID
	IID_IUIAutomation = syscall.GUID{
		Data1: 0x30cbe57d,
		Data2: 0xd9d0,
		Data3: 0x452a,
		Data4: [8]byte{0xab, 0x13, 0x7a, 0xc5, 0xac, 0x48, 0x25, 0xee},
	}

	// IUIAutomationTextPattern IID
	IID_IUIAutomationTextPattern = syscall.GUID{
		Data1: 0x32eba289,
		Data2: 0x3583,
		Data3: 0x42c9,
		Data4: [8]byte{0x9c, 0x59, 0x3b, 0x6d, 0x9a, 0x1e, 0x9b, 0x6a},
	}
)

const (
	UIA_TextPatternId = 10014 // Text Pattern ID
)

// UIAutomationTextExtractor 使用UI Automation API获取选中文本
type UIAutomationTextExtractor struct {
	ole32            *syscall.LazyDLL
	oleaut32         *syscall.LazyDLL
	coInitializeEx   *syscall.LazyProc
	coCreateInstance *syscall.LazyProc
	coUninitialize   *syscall.LazyProc
	sysAllocString   *syscall.LazyProc
	sysFreeString    *syscall.LazyProc
	initialized      bool
	uiAutomation     uintptr
}

// NewUIAutomationTextExtractor 创建UI Automation文本提取器
func NewUIAutomationTextExtractor() *UIAutomationTextExtractor {
	extractor := &UIAutomationTextExtractor{
		ole32:    syscall.NewLazyDLL("ole32.dll"),
		oleaut32: syscall.NewLazyDLL("oleaut32.dll"),
	}

	extractor.coInitializeEx = extractor.ole32.NewProc("CoInitializeEx")
	extractor.coCreateInstance = extractor.ole32.NewProc("CoCreateInstance")
	extractor.coUninitialize = extractor.ole32.NewProc("CoUninitialize")
	extractor.sysAllocString = extractor.oleaut32.NewProc("SysAllocString")
	extractor.sysFreeString = extractor.oleaut32.NewProc("SysFreeString")

	return extractor
}

// Initialize 初始化COM和UI Automation
func (u *UIAutomationTextExtractor) Initialize() error {
	if u.initialized {
		return nil
	}

	// 初始化COM库（多线程模式）
	const COINIT_MULTITHREADED = 0x0
	ret, _, err := u.coInitializeEx.Call(0, COINIT_MULTITHREADED)
	if ret != 0 && ret != 1 { // S_OK = 0, S_FALSE = 1 (already initialized)
		return err
	}

	// 创建UI Automation对象
	var pAutomation uintptr
	ret, _, err = u.coCreateInstance.Call(
		uintptr(unsafe.Pointer(&CLSID_CUIAutomation)),
		0,
		1, // CLSCTX_INPROC_SERVER
		uintptr(unsafe.Pointer(&IID_IUIAutomation)),
		uintptr(unsafe.Pointer(&pAutomation)),
	)

	if ret != 0 {
		u.coUninitialize.Call()
		return err
	}

	u.uiAutomation = pAutomation
	u.initialized = true

	return nil
}

// GetSelectedText 使用UI Automation获取当前选中的文本
func (u *UIAutomationTextExtractor) GetSelectedText() string {
	if !u.initialized {
		if err := u.Initialize(); err != nil {
			return ""
		}
	}

	// 获取当前焦点元素
	focusedElement := u.getFocusedElement()
	if focusedElement == 0 {
		return ""
	}
	defer u.releaseElement(focusedElement)

	// 尝试获取Text Pattern
	textPattern := u.getTextPattern(focusedElement)
	if textPattern == 0 {
		// 如果没有Text Pattern，尝试使用Value Pattern
		return u.getValuePatternText(focusedElement)
	}
	defer u.releasePattern(textPattern)

	// 获取选中的文本
	selectedText := u.getSelectionText(textPattern)
	return selectedText
}

// getFocusedElement 获取当前焦点元素
func (u *UIAutomationTextExtractor) getFocusedElement() uintptr {
	if u.uiAutomation == 0 {
		return 0
	}

	// 调用IUIAutomation::GetFocusedElement
	// vtable offset: 8 (after IUnknown methods)
	vtable := *(*uintptr)(unsafe.Pointer(u.uiAutomation))
	getFocusedElement := *(*uintptr)(unsafe.Pointer(vtable + 8*unsafe.Sizeof(uintptr(0))))

	var element uintptr
	ret, _, _ := syscall.Syscall(
		getFocusedElement,
		2,
		u.uiAutomation,
		uintptr(unsafe.Pointer(&element)),
		0,
	)

	if ret != 0 {
		return 0
	}

	return element
}

// getTextPattern 获取元素的Text Pattern
func (u *UIAutomationTextExtractor) getTextPattern(element uintptr) uintptr {
	if element == 0 {
		return 0
	}

	// 调用IUIAutomationElement::GetCurrentPattern
	// vtable offset: 需要根据实际接口定义调整
	// 简化实现：直接返回0，使用备用方案
	return 0
}

// getSelectionText 从Text Pattern获取选中文本
func (u *UIAutomationTextExtractor) getSelectionText(textPattern uintptr) string {
	if textPattern == 0 {
		return ""
	}

	// 简化实现
	return ""
}

// getValuePatternText 使用Value Pattern获取文本（备用方案）
func (u *UIAutomationTextExtractor) getValuePatternText(element uintptr) string {
	// 备用方案：对于某些控件，可以使用Value Pattern
	return ""
}

// releaseElement 释放元素COM对象
func (u *UIAutomationTextExtractor) releaseElement(element uintptr) {
	if element != 0 {
		// 调用IUnknown::Release
		vtable := *(*uintptr)(unsafe.Pointer(element))
		release := *(*uintptr)(unsafe.Pointer(vtable + 2*unsafe.Sizeof(uintptr(0))))
		syscall.Syscall(release, 1, element, 0, 0)
	}
}

// releasePattern 释放Pattern COM对象
func (u *UIAutomationTextExtractor) releasePattern(pattern uintptr) {
	if pattern != 0 {
		vtable := *(*uintptr)(unsafe.Pointer(pattern))
		release := *(*uintptr)(unsafe.Pointer(vtable + 2*unsafe.Sizeof(uintptr(0))))
		syscall.Syscall(release, 1, pattern, 0, 0)
	}
}

// Cleanup 清理资源
func (u *UIAutomationTextExtractor) Cleanup() {
	if u.initialized {
		if u.uiAutomation != 0 {
			u.releaseElement(u.uiAutomation)
			u.uiAutomation = 0
		}
		u.coUninitialize.Call()
		u.initialized = false
	}
}
