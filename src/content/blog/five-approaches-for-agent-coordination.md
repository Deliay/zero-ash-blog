---
title: 'Claude 提出的 5 种 AI Agent 协作模式'
description: '分析 Claude 提出的 5 种多 AI Agent 协作模式：适用场景、各自的局限与选型思路'
pubDate: 'Apr 20 2026'
updatedDate: 'Apr 20 2026'
tags: ["AI", "agent"]
---

## 前言

多 Agent 趋势已经到来。相比于单个 Agent，多 Agent 天生就有上下文隔离、更擅长处理单元任务的优势。Agent 是可以调度 Agent 的，它们之间如何协作，是一个值得研究的问题。

多 Agent 协作要么一直跑不收敛，要么 Agent 改一个文件相互覆盖，要么 orchestrator 跑偏……

我们来看 Claude 提出的 5 种多 Agent 协作模式。

## 5 种模式及其 cons

复杂的 Agent 协作模式代价往往很高：调试难、追踪难，一旦出现问题很难排查。Claude 建议所有的多 Agent 系统都从最简单的单 Agent 开始，有问题再往多 Agent 系统上靠；此时也应该从多 Agent 中最简单的模式开始，最简单的撑不住了，再根据实际问题逐步往复杂的模式走。

| 模式 | 场景 | 结构 |
| :-: | :-: | :-: |
| Generator + Evaluator | 有准确可量化评估标准的场景（如写代码 + 跑 UT） | 2 个 Agent 协同工作，1 个负责生成、1 个负责验证，来回迭代直到通过 |
| Orchestrator + SubAgent | 任务能够被清晰拆解，子任务边界明确，彼此依赖不重（如理解代码仓库） | 主 Agent 负责拆分任务、指派任务、调起子 Agent 执行，并负责验收结果 |
| Agent Teams | 独立处理多步骤任务，持续累积某个领域的上下文（如重构微服务） | 将某种类型的任务长期指派给固定的一个 Agent，Agent 长期存在 |
| EventBus | 流程是动态的工作流，系统需要扩展性的场景（如处理告警） | Agent 相互之间通过一个 EventBus 进行发布订阅事件 |
| Shared State | 共享知识，信息相互影响，下一步决策根据已有信息继续（如协作研究） | Agent 相互共享知识库存储，所有 Agent 都可以读取、写入，并实时感知这些写入 |

### Generator + Evaluator 的 cons

- Evaluator 有标准，但没明确：只是简单的说"写 UT，UT 跑过"。结果只会是自拟合，不能达到我们的实际要求。这种场景需要定义明确的验收规则和标准，禁止模糊。
- Evaluator 没有客观标准：这个场景无法适用 Gen-Eval 模式，因为判断好与不好无法通过一个客观的标准来判断。比如评判一个广告用语好不好、文案有没有说服力。
- Evaluator 没有 Fallback：一直不收敛，一直在迭代。这种场景需要设定一个最大迭代次数，失败之后返回最好版本，或者通知人来处理。

### Orchestrator + SubAgent 的 cons

- 上下文在传递时丢失：主 Agent（即 orchestrator）向 SubAgent 传递信息时，通过摘要传递会丢失细节。如果某个 SubAgent 发现的信息会影响其他 SubAgent 的产出，这个信息需要先流回主 Agent，还要经过主 Agent 判断要不要转给其他 Agent，信息传递链条长，很容易丢失。
- 没搞并行化：如果任务不能拆成并行的多个 SubAgent 一起执行，多余的 token 是白烧了，还会有其他的缺点，比如上下文传递丢信息。

### Agent Teams 的 cons

- 缺少独立性：如果某个 worker 在改动时需要向其他 worker 传递信息，则这个模式就不适用。
- 对 coordination 要求高：Agent Teams 的 workers 是持续运行的，不同 worker 完成进度可能不一样，对协调者要求会比较高。
- 共享资源会冲突：如果任务边界没处理好，某个 worker 的修改会影响其他 worker，某些共享资源（如共同修改一个分支的文件）会产生冲突。

### EventBus 的 cons

- 追踪变难：一个事件可能会触发一连串级联事件。比如告警进来触发 triage agent 判断类型，如果是 A 类业务的告警，则发布一个 A 业务告警处理事件，B 类业务告警则发布 B 业务告警处理事件；各自的 agent 处理完，还会发布一个 response 事件让 response agent 负责后续工作。做好链路追踪是难点。
- 事件没有被正确处理：是否响应事件、是否发布是 agent 自己决定的，错误响应事件、错误不响应事件、错误发布事件，都会造成问题。

### Shared State 的 cons

- 无法停止：A 写入了，B 又写入，触发了 C，C 写入触发了 A，没有办法停止，需要提前设置好完善的中止条件。
- 并发写冲突：如果两个 Agent 同时调查了一个目标，此时都想往知识库写入，需要额外的工程来处理这些问题。
- 设计下限要求很高：不像其他模式有中心协调者，协调逻辑、写入条件、中止条件都需要在落地时自己设计。

## 我的思考

### 何时选 Orchestrator + SubAgent

一个单 Agent 系统要往多 Agent 演化时，可以先往 Orchestrator + SubAgent 的模式走：从主任务中拆出边界清楚的子任务，再按照子任务的结果进行下一步操作，这个往往就能适配大多数场景了。而且这个结构也是最容易实践的结构，主任务有清晰的主线，协调成本也很低。

### 何时选 Agent Teams

在需要长期保留上下文的场景使用 Agent Teams，比如持续地重构某一个微服务架构：一个 Agent 负责一个微服务，长期累积知识，长期推进，长期处理。**这里也可以直接看你的上下文需要保留多久：如果用完即弃，则使用 Orchestrator + SubAgent 模式；如果需要长期保留，则使用 Agent Teams 模式。**

### 何时选 EventBus

随着业务发展，工作流变得不可预测的时候，我们就可以选用 EventBus 来驱动整个 agent 网络。如果主 Agent 需要处理大量分支条件，如果你的提示词、你的 harness 里大量出现条件判断，此时就应该往 EventBus 方向走。但随之带来的也是系统复杂度的升高。

### 何时选 Shared State

在一个 agent 或一个 worker 的中间发现对其他 agent 也有用时，即"共享发现"是这个系统最重要的决策环节，就需要用 shared state 来做中间协调者。举例来说，Agent Teams 是分区自治的原子微服务，shared state 就是共享 context 的 monolith service。此时你需要一系列的工程手段来做 agent 的锁，比如何时写入、怎样写入、怎样解决冲突，加锁、加规则、加提示词等等等等。

### 选型究竟选的什么

在评估完每种模式如何选之后，我们发现它们都会有几个共同逻辑：
- 上下文保留多久？
- 流程是不是相对清晰可预测的？
- 信息需不需要实时共享？

我们可以把这三个问题列出来，好好回答，就会有选型的结果。

### 是不是漏了 Generator + Evaluator

个人感觉这个模式与其他模式有很大的区别，它更像是一个通用的组件。如果你的某个 agent 的结果需要严格地进行验收、进行质量保证，就应该想办法进行评估，比如我们写代码必须要覆盖 UT 一样。这个模式可以配合上述所有模式使用，只要是对 agent 产出的内容要求严格时，都应该想办法做 evaluation。

### 有机结合

其实几种模式个人认为是可以相互叠加的，比如：
- Orchestrator + SubAgent 可以套一个或者多个 shared state，上下文相关的几个 agent 共用一个 shared state；
- 用 event bus 做事件响应，但响应的 agent 本身是一个 agent teams 的 worker；
- 甚至是某个环节使用 shared state，在搞完这个环节的任务之后，返回结果。
