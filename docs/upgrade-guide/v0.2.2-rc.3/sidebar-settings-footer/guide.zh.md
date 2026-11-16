---
kind: upgrade-guide
description: "侧栏底部始终渲染外壳的设置按钮；设置启动器插槽及其通知席位被替换。"
---

# 侧栏设置按钮与账号菜单

[English](guide.md) | 中文

## 变更

侧栏底部在所有账号状态下都渲染设置外壳自己的按钮。`@deepseek-ai/dsh-client-ui-settings` 不再声明 `settings.launcher` 插槽或 `SettingsLauncherOwnerProps`；其 `settings.launcher.notifications` 插槽改由外壳声明为 `settings.trigger.notifications`，并定位在按钮行上方。此前替换设置按钮的入口贡献不再有席位，注册会失败。

`settings.trigger.notifications` 接收 `{ openSettings }`，不再接收启动器传入的 `{ active, openAccount }`。外壳负责锚定位置、导航，以及在收起为窄栏时保持贡献挂载而不显示；可见性由注册方负责。`SettingsSectionOwnerProps` 新增 `openOnboarding(id)`，设置页面因此可以把流程交给已注册的引导编辑器。

账号插件不再提供启动器。登录、退出登录与意见反馈移入账号设置分区，该分区在所有账号状态下都存在（账号语言的 `nav` 文案）。账号提醒通过 `shell.overlay` 条目渲染，因此凭证过期和模型登录提示在设置关闭时仍会出现。

## 迁移

1. 删除所有向 `settings.launcher` 的注册，以及对 `settings.launcher.notifications` 的声明。外壳无条件渲染设置按钮，依赖回退的组合同样无需替换。
2. 把账号菜单内容移入设置页面：为内容注册 `settings.section` 贡献，并使用该分区的 `close` 与 `openOnboarding` 宿主属性处理离开页面的流程。登录、退出登录和意见反馈属于拥有它们的页面，而不属于浏览器外壳。
3. 把底部通知改注册到 `settings.trigger.notifications`。可见性由你自己的账号状态计算；卡片操作调用 `openSettings('account')`（或你拥有的分区）。瞬态提示放在 `shell.overlay` 条目中，以便在报告它的面板关闭后仍然存在。
4. 此前读取启动器传入值的账号消费方改为读取账号设置分区：共享账号流、`AccountUiState` 快照（现在可选携带 `onboarding` 与 `desktopOnboardingVisible`），以及分区宿主属性。账号字典不再定义 `settings` 与 `menu`。
5. 重新构建 Client bundle，并在展开与折叠窄栏、键盘命令打开的设置对话框，以及账号分区的已登录和未登录状态中验证侧栏底部。
