/**
 * 悬浮球相关的TypeScript类型定义
 */

/**
 * 悬浮球API接口
 */
export interface FloatingBallAPI {
  /**
   * 显示悬浮球
   */
  show: () => Promise<{ success: boolean; error?: string }>

  /**
   * 隐藏悬浮球
   */
  hide: () => Promise<{ success: boolean; error?: string }>

  /**
   * 关闭悬浮球
   */
  close: () => Promise<{ success: boolean; error?: string }>

  /**
   * 设置悬浮球位置
   * @param x 横坐标
   * @param y 纵坐标
   */
  setPosition: (x: number, y: number) => Promise<{ success: boolean; error?: string }>

  /**
   * 获取悬浮球当前位置
   */
  getPosition: () => Promise<{ success: boolean; x?: number; y?: number; error?: string }>

  /**
   * 获取屏幕尺寸
   */
  getScreenSize: () => Promise<{ success: boolean; width?: number; height?: number; error?: string }>

  /**
   * 处理菜单项点击
   * @param action 菜单项动作
   */
  onMenuClick: (action: string) => Promise<{ success: boolean; message?: string; error?: string }>

  /**
   * 显示原生右键菜单
   * @param data 菜单状态数据(可选)
   */
  showContextMenu: (data?: any) => Promise<{ success: boolean; error?: string }>

  /**
   * 监听菜单项点击事件
   * @param callback 回调函数
   */
  onMenuAction: (callback: (action: string) => void) => void
}

/**
 * 悬浮球菜单项类型
 */
export type FloatingBallMenuAction = 'todo' | 'weather' | 'ask-fuzfox' | 'close'

/**
 * 悬浮球菜单项配置
 */
export interface FloatingBallMenuItem {
  action: FloatingBallMenuAction | string
  label: string
  icon: string
}

