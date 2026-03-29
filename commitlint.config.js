export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 类型枚举
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复bug
        'docs',     // 文档更新
        'style',    // 代码格式化，不影响代码逻辑
        'refactor', // 重构代码
        'perf',     // 性能优化
        'test',     // 测试相关
        'build',    // 构建系统或外部依赖变更
        'ci',       // CI配置文件和脚本变更
        'chore',    // 其他不修改src或test文件的变更
        'revert',   // 回滚提交
      ],
    ],
    // 主题不能为空
    'subject-empty': [2, 'never'],
    // 主题最大长度
    'subject-max-length': [2, 'always', 100],
    // 主题格式（允许中文）
    'subject-case': [0],
    // 类型不能为空
    'type-empty': [2, 'never'],
    // 类型格式
    'type-case': [2, 'always', 'lower-case'],
    // 范围格式
    'scope-case': [2, 'always', 'lower-case'],
    // 头部最大长度
    'header-max-length': [2, 'always', 120],
    // 正文前需要空行
    'body-leading-blank': [1, 'always'],
    // 脚注前需要空行
    'footer-leading-blank': [1, 'always'],
  },
}
