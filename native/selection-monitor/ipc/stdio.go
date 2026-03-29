package ipc

import (
	"bufio"
	"encoding/json"
	"os"
)

// StdioComm 标准输入输出通信器
// 通过stdin/stdout与Electron主进程通信
type StdioComm struct {
	writer *bufio.Writer
}

// NewStdioComm 创建标准输入输出通信器
func NewStdioComm() *StdioComm {
	return &StdioComm{
		writer: bufio.NewWriter(os.Stdout),
	}
}

// Send 发送JSON数据到stdout
func (c *StdioComm) Send(data interface{}) error {
	// 序列化为JSON
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	// 写入JSON数据
	if _, err := c.writer.Write(jsonData); err != nil {
		return err
	}

	// 写入换行符（作为消息分隔符）
	if _, err := c.writer.WriteString("\n"); err != nil {
		return err
	}

	// 刷新缓冲区
	return c.writer.Flush()
}

