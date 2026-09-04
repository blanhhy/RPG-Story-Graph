这里是 RPG Maker 2000 / 2003 (+ EasyRPG & Maniac Patch 扩展) 的事件表参考

> 按照官方 RPG Maker 2003 编辑器中的显示顺序排序

- LCF 名称：由 EasyRPG 定义的名称
- 参考显示名：Editor 中可能会显示的名称
- 命令码：Runtime 中的事件指令码
- 特注：是否为流程控制或者版本要求之类的
- 简介：功能简介

| LCF 名称 | 参考显示名 | 命令码 | 特注 | 简介 |
| --- | --- | --- | --- | --- |
| ShowMessage | 显示消息 | 10110 | | 显示一条对话消息 |
| MessageOptions | 更改对话框 | 10120 | | 设置对话框背景的显隐、展示位置等等 |
| ChangeFaceGraphic | 更改脸图 | 10130 | | 改变或者取消对话框中的角色脸图 |
| ShowChoice | 显示选项 | 10140 | 流程控制 | 在对话框显示选项列表，根据玩家选择执行不同代码分支 |
| InputNumber | 输入数字 | 10150 | | 请求玩家输入一个 n 位整数 |
| ControlSwitches | 控制开关 | 10210 | | 控制开关 |
| ControlVars | 控制变量 | 10220 | | 兼具初始化 & 赋值 & 计算 & 间接寻址功能 |
| TimerOperation | 定时器操作 | 10230 | | 给全局计时器发送指令 |
| ChangeGold | 更改金钱 | 10310 | | 改变队伍的金钱数量 |
| ChangeItems | 更改道具 | 10320 | | 改变队伍的背包物品 |
| ChangePartyMembers | 更改队伍成员 | 10330 | | 改变队伍成员 |
| ChangeExp | 更改经验 | 10410 | | 改变角色的经验值 |
| ChangeLevel | 更改等级 | 10420 | | 改变角色的等级 |
| ChangeParameters | 更改能力值 | 10430 | | 改变角色的能力值 |
| ChangeSkills | 更改技能 | 10440 | | 改变角色的技能列表 |
| ChangeEquipment | 更改装备 | 10450 | | 改变角色的装备列表 |
| ChangeHP | 更改生命值 | 10460 | | 改变角色的生命值 |
| ChangeSP | 更改魔法值 | 10470 | | 改变角色的魔法值 |
| ChangeCondition | 更改状态 | 10480 | | 改变角色的状态 |
| FullHeal | 完全治疗 | 10490 | | 完全治疗角色 |
| SimulatedAttack | 施加伤害 | 10500 | | 使角色受到攻击伤害 |
| ChangeHeroName | 更改角色名字 | 10610 | | 改变指定编号的角色的名称（也常用于在无扩展环境下模拟字符串变量） |
| ChangeHeroTitle | 更改角色头衔 | 10620 | | 改变角色的头衔（简介） |
| ChangeSpriteAssociation | 更改角色图像 | 10630 | | 改变角色的行走图 |
| ChangeActorFace | 更改角色脸图 | 10640 | | 改变角色的脸图（角色面板 & 存档页面） |
| ChangeVehicleGraphic | 更改载具图像 | 10650 | | 改变载具的行走图 |
| ChangeSystemBGM | 更改系统 BGM | 10660 | | 运行时更换系统的 BGM |
| ChangeSystemSFX | 更改系统音效 | 10670 | | 运行时更换系统的音效 |
| ChangeSystemGraphics | 更改系统图像 | 10680 | | 运行时更换系统的 UI 贴图 |
| ChangeScreenTransitions | 更改转场特效 | 10690 | | 运行时更换系统的转场特效 |
| EnemyEncounter | 进入战斗 | 10710 | | 使队伍遭遇战斗 |
| OpenShop | 进入商店 | 10720 | | 唤起商店界面 |
| ShowInn | 进入旅馆 | 10730 | | 花费金钱恢复 HP&MP |
| EnterHeroName | 输入角色名字 | 10740 | | 请求玩家输入角色的名称 |
| Teleport | 转移玩家 | 10810 | | 移动玩家到指定位置 |
| MemorizeLocation | 获取玩家位置 | 10820 | | 获取玩家当前的位置 |
| RecallToLocation | 移动到保存位置 | 10830 | | `Teleport` 的变量寻址版本 |
| EnterExitVehicle | 乘降交通工具 | 10840 | | 乘坐附近载具或退出当前载具 |
| SetVehicleLocation | 设置载具位置 | 10850 | | 设置载具的位置 |
| ChangeEventLocation | 更改事件位置 | 10860 | | 改变事件的位置 |
| TradeEventLocations | 交换事件位置 | 10870 | | 互换两个事件的位置 |
| StoreTerrainID | 获取地形 ID | 10910 | | 获取指定位置的地形 ID |
| StoreEventID | 获取事件 ID | 10920 | | 获取指定位置的事件 ID |
| EraseScreen | 淡出画面 | 11010 | | 临时弹出游戏的屏幕画面 |
| ShowScreen | 显示画面 | 11020 | | 重新显示游戏的屏幕画面 |
| TintScreen | 着色画面 | 11030 | | 改变游戏画面的叠加色调 |
| FlashScreen | 画面闪烁 | 11040 | | 显示全屏闪光特效 |
| ShakeScreen | 画面震动 | 11050 | | 显示屏幕震动特效 |
| PanScreen | 移动镜头 | 11060 | | 设置固定视角或移动摄像机 |
| WeatherEffects | 天气效果 | 11070 | | 渲染天气效果 |
| ShowPicture | 显示图片 | 11110 | | 自由渲染图片 |
| MovePicture | 移动图片 | 11120 | | 移动已渲染的图片 |
| ErasePicture | 消除图片 | 11130 | | 销毁已渲染的图片 |
| ShowBattleAnimation | 显示动画 | 11210 | | 播放指定的动画 |
| PlayerVisibility | 隐藏玩家 | 11310 | | 隐藏玩家或取消隐藏 |
| FlashSprite | 事件闪烁 | 11320 | | 对地图事件的图像应用闪光特效 |
| MoveEvent | 设置移动路线 | 11330 | | 指定玩家或地图事件的移动路线 |
| ProceedWithMovement | 等待移动完成 | 11340 | | 等待所有设置的移动路线完成再执行后续代码 |
| HaltAllMovement | 停止所有移动 | 11350 | | 打断所有进行中的移动路线 |
| Wait | 等待 | 11410 | | `sleep()` |
| PlayBGM | 播放 BGM | 11510 | | 播放指定的 BGM |
| FadeOutBGM | 淡出 BGM | 11520 | | 淡出当前播放的 BGM |
| MemorizeBGM | 暂存 BGM | 11530 | | 临时记录当前播放的 BGM |
| PlayMemorizedBGM | 重放 BGM | 11540 | | 播放上次暂存的 BGM |
| PlaySound | 播放 SE | 11550 | | 播放指定的 SE |
| PlayMovie | 播放视频 | 11560 | | 播放指定的视频 |
| KeyInputProc | 按键监听 | 11610 | | 监听按键输入 |
| ChangeMapTileset | 更改芯片组 | 11710 | | 运行时更换当前地图的芯片组 |
| ChangePBG | 更改远景 | 11720 | | 运行时更换当前地图的远景 |
| ChangeEncounterSteps | 更改遇敌步数 | 11740 | | 运行时改变当前地图的遇敌步数 |
| TileSubstitution | 地图元件替换 | 11750 | | 把一种元件全部替换为另一种元件 |
| TeleportTargets | 设置传送点 | 11810 | | 设置传送技能的目标位置 |
| ChangeTeleportAccess | 更改传送权限 | 11820 | | 允许或禁止使用传送 |
| EscapeTarget | 设置逃脱点 | 11830 | | 设置逃脱技能的目标位置 |
| ChangeEscapeAccess | 更改逃脱权限 | 11840 | | 允许或禁止使用逃脱 |
| OpenSaveMenu | 打开存档界面 | 11910 | | 如题 |
| ChangeSaveAccess | 更改存档权限 | 11930 | | 如题 |
| OpenMainMenu | 打开菜单界面 | 11950 | | 如题 |
| ChangeMainMenuAccess | 更改菜单权限 | 11960 | | 允许或禁止打开菜单 |
| ConditionalBranch | IF | 12010 | 流程控制 | `if` |
| Label | 标签 | 12110 | 语法 | 声明跳转标签，事件页作用域 |
| JumpToLabel | GOTO | 12120 | 流程控制 | `goto` |
| Loop | LOOP | 12210 | 流程控制 | `while true` |
| BreakLoop | BREAK | 12220 | 流程控制 | `break` |
| EndEventProcessing | RETURN | 12310 | 流程控制 | 提前结束当前调用 |
| EraseEvent | 消除事件 | 12320 | | 仅对地图事件有效，在地图卸载前就卸载当前事件 |
| CallEvent | 调用事件 | 12330 | | 调用指定事件页 |
| CallCommonEvent | 调用公共事件 | 1005 | | 调用指定公共事件 |
| Comment | # | 12410 | | 模拟注释，会消耗指令周期 |
| GameOver | 游戏结束 | 12420 | | 显示 GameOver 画面 |
| ReturntoTitleScreen | 返回标题 | 12510 | | 返回标题画面 |
| ChangeClass | 更改角色职业 | 1008 | 2k3+  | 更改角色的职业 |
| ChangeBattleCommands | 更改战斗指令 | 1009 | 2k3+  | 增加或删除角色的战斗指令 |
| OpenLoadMenu | 打开读档界面 | 5001 | 2k内部 2k3公开 | 如题 |
| ExitGame | 退出游戏 | 5002 | 2k内部 2k3公开 | 如题 |
| ToggleAtbMode | 切换 ATB 等待模式 | 5003 | 2k3+ | 如题 |
| ToggleFullscreen | 切换全屏 | 5004 | 2k3+ | 如题 |
| OpenVideoOptions | 打开游戏选项 | 5005 | 2k3+ | 打开视频选项界面 |
| ForceFlee | 强制逃跑 | 1006 | 战斗中 | 强制己方逃脱成功 |
| EnableCombo | 允许连击 | 1007 | 战斗中 | 设置己方角色单回合的行动次数 |
| ChangeMonsterHP | 更改敌人 HP | 13110 | 战斗中 | 如题 |
| ChangeMonsterMP | 更改敌人 MP | 13120 | 战斗中 | 如题 |
| ChangeMonsterCondition | 更改敌人状态 | 13130 | 战斗中 | 如题 |
| ShowHiddenMonster | 显示/隐藏敌人 | 13150 | 战斗中 内部 | 作用不明 |
| ChangeBattleBG | 更改战斗背景 | 13210 | 战斗中 内部 | 如题 |
| ShowBattleAnimation_B | 显示动画 | 13260 | 战斗中 | 战斗事件中的 `ShowBattleAnimation` 替代版本，选择器适应战斗场景 |
| ConditionalBranch_B | IF | 13310 | 战斗中 流程控制 | 战斗事件中的 `ConditionalBranch` 替代版本，支持读取战斗状态 |
| TerminateBattle | 中断战斗 | 13410 | 战斗中 | 如题 |
| ShowMessage_2 | | 20110 | 语法 | `ShowMessage` 的跨行文本标记 |
| ShowChoiceOption | CASE | 20140 | 流程控制 | `ShowChoice` 的选项分支 |
| ShowChoiceEnd | END | 20141 | 语法 | `ShowChoice` 代码块结束标记 |
| VictoryHandler | | 20710 | 内部 | 作用不明 |
| EscapeHandler | | 20711 | 内部 | 作用不明 |
| DefeatHandler | | 20712 | 内部 | 作用不明 |
| EndBattle | | 20713 | 内部 | 作用不明 |
| Transaction | | 20720 | 内部 | 作用不明 |
| NoTransaction | | 20721 | 内部 | 作用不明 |
| EndShop | | 20722 | 内部 | 作用不明 |
| Stay | | 20730 | 内部 | 作用不明 |
| NoStay | | 20731 | 内部 | 作用不明 |
| EndInn | | 20732 | 内部 | 作用不明 |
| ElseBranch | ELSE | 22010 | 语法 流程控制 | `ConditionalBranch` 的 `ELSE` 分支起始标记 |
| EndBranch | END | 22011 | 语法 | `ConditionalBranch` 的代码块结束标记 |
| EndLoop | END | 22210 | 语法 | `Loop` 的代码块结束标记 |
| Comment_2 | # | 22410 | 语法 | `Comment` 的文本跨行标记 |
| ElseBranch_B | ELSE | 23310 | 语法 流程控制 | `ConditionalBranch_B` 的 `ELSE` 分支起始标记 |
| EndBranch_B | END | 23311 | 语法 | `ConditionalBranch_B` 的代码块结束标记 |
| End | | 10 | 内部 | 自动填充在任何可插入新代码的代码块结尾处的空行 |
| EasyRpg_TriggerEventAt | [EasyRpg] TriggerEventAt | 2002 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_Pathfinder | [EasyRpg] Pathfinder | 2003 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_CallMovementAction | [EasyRpg] CallMovementAction | 2050 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_WaitForSingleMovement | [EasyRpg] WaitForSingleMovement | 2051 | EasyRPG 扩展 | 只等待单个移动完成 |
| EasyRpg_AnimateVariable | [EasyRpg] AnimateVariable | 2052 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_SetInterpreterFlag | [EasyRpg] SetInterpreterFlag | 2053 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_ProcessJson | [EasyRpg] ProcessJson | 2055 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_CloneMapEvent | [EasyRpg] CloneMapEvent | 2056 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_DestroyMapEvent | [EasyRpg] DestroyMapEvent | 2057 | EasyRPG 扩展 | 作用不明 |
| EasyRpg_StringPictureMenu | [EasyRpg] StringPictureMenu | 2058 | EasyRPG 扩展 | 作用不明 |
| Maniac_GetSaveInfo | [Maniac] 获取存档信息 | 3001 | Maniac 扩展 | 没用过不知道 |
| Maniac_Save | [Maniac] 新建存档 | 3002 | Maniac 扩展 | 程序自动存档 |
| Maniac_Load | [Maniac] 加载存档 | 3003 | Maniac 扩展 | 程序自动读档 |
| Maniac_EndLoadProcess | [Maniac] EndLoadProcess | 3004 | Maniac 扩展 | 没用过不知道 |
| Maniac_GetMousePosition | [Maniac] 获取鼠标位置 | 3005 | Maniac 扩展 | 如题 |
| Maniac_SetMousePosition | [Maniac] 设置鼠标位置 | 3006 | Maniac 扩展 | 如题 |
| Maniac_ShowStringPicture | [Maniac] ShowStringPicture | 3007 | Maniac 扩展 | 没用过不知道 |
| Maniac_GetPictureInfo | [Maniac] 获取图片信息 | 3008 | Maniac 扩展 | 没用过不知道 |
| Maniac_ControlBattle | [Maniac] 控制战斗 | 3009 | Maniac 扩展 | 没用过不知道 |
| Maniac_ControlAtbGauge | [Maniac] 控制 ATB 等待 | 3010 | Maniac 扩展 | 没用过不知道 |
| Maniac_ChangeBattleCommandEx | [Maniac] 更改战斗指令 | 3011 | Maniac 扩展 | 增强版的 `ChangeBattleCommands` |
| Maniac_GetBattleInfo | [Maniac] 获取战斗信息 | 3012 | Maniac 扩展 | 没用过不知道 |
| Maniac_ControlVarArray | [Maniac] 控制数组 | 3013 | Maniac 扩展 | 数组型变量操作 |
| Maniac_KeyInputProcEx | [Maniac] 按键监听 | 3014 | Maniac 扩展 | 增强版的 `KeyInputProc` |
| Maniac_RewriteMap | [Maniac] 重写地图 | 3015 | Maniac 扩展 | 没用过不知道 |
| Maniac_ControlGlobalSave | [Maniac] 控制全局保存 | 3016 | Maniac 扩展 | 没用过不知道 |
| Maniac_ChangePictureId | [Maniac] 更改图片 ID | 3017 | Maniac 扩展 | 迁移已渲染图片的 ID |
| Maniac_SetGameOption | [Maniac] 设置游戏选项 | 3018 | Maniac 扩展 | 没用过不知道 |
| Maniac_CallCommand | [Maniac] 调用命令 | 3019 | Maniac 扩展 | 调用任意已知命令 |
| Maniac_ControlStrings | [Maniac] 控制字符串 | 3020 | Maniac 扩展 | 字符串型变量操作 |
| Maniac_GetGameInfo | [Maniac] 获取游戏信息 | 3021 | Maniac 扩展 | 没用过不知道 |
| Maniac_EditPicture | [Maniac] 编辑图片 | 3025 | Maniac 扩展 | 编辑已渲染的图片 |
| Maniac_WritePicture | [Maniac] WritePicture | 3026 | Maniac 扩展 | 没用过不知道 |
| Maniac_AddMoveRoute | [Maniac] 添加移动路线 | 3027 | Maniac 扩展 | 没用过不知道 |
| Maniac_EditTile | [Maniac] 编辑图块 | 3028 | Maniac 扩展 | 没用过不知道 |
| Maniac_ControlTextProcessing | [Maniac] ControlTextProcessing | 3029 | Maniac 扩展 | 没用过不知道 |
| Maniac_Zoom | [Maniac] 缩放 | 3032 | Maniac 扩展 | 没用过不知道 |
