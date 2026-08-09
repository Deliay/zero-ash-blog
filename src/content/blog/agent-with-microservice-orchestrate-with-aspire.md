---
title: 'Agent + 微服务 本地开发最佳实践 —— Aspire 引入'
description: '利用 Aspire + Playwright 让 AI 自动跑起来测试环境'
pubDate: 'Apr 09 2026'
updatedDate: 'Apr 09 2026'
tags: ["microservice", "orchestrator", "aspire"]
---

## 前言

在全栈 Agent 开发上下文中，我们往往需要多个 Agent / SubAgent 协作开发。用单测（UT）可以让 Agent 对自己写的代码负责，但如果需要多个项目同时进行联调测试，就得把上下文同步到多个 Agent 中，比较麻烦。Aspire 提供的编排能力正好能够把整体项目统一编排起来，然后只需要一个 Agent 拉起测试即可。

## Aspire 是什么

Aspire 是一个统一的本地服务编排工具，通过一套特殊的 DSL 描述服务的依赖关系、环境变量、开放端口，借助 docker / podman 和本地运行时（go、nodejs 等）快速拉起所有需要的服务，并注入所需的环境变量。

我在多个项目中已经落地这套方案。相较于传统的开发环境配置，可以节省大量的本地环境配置时间：在一个由 3 个 Node.js 后端服务 + 2 个前端服务 + PostgreSQL + Redis + RabbitMQ + Kafka 组成的应用中，10 分钟就能顺利把整个项目跑起来。setup 只需要安装 .NET runtime（Aspire 依赖）、docker 以及对应的本地运行时（如 Node.js），剩下的工作全部在 Aspire 的编排脚本中完成。

因为 Aspire 掌握了服务列表、服务间依赖的上下文、所需的环境变量、暴露的接口等几乎所有的运维配置，所以它还能支持生成 docker 或 k8s 的 deploy manifest。比如 docker 生成的产物是一个 `.env` 文件和一个 `docker-compose.yaml`，在真实部署场景下只需编辑 `.env` 填入对应环境变量即可，十分方便。

Aspire 最近推出了 `aspire-cli`，配合完备的文档功能，直接打通了与 Agent 的协作通道。同时 `aspire-cli` 的 `--isolate` 参数，也能让诸如 Claude Agent Teams 这类多 Agent 在同时开发多个需求时，为不同的 worktree 独立拉起各自 worktree 对应的服务。

## 接入 Aspire

### 安装 aspire-cli

先去 Aspire 官网按照[安装教程](https://aspire.dev/get-started/install-cli/)安装 `aspire` CLI。安装后运行 `aspire agent`，可以看到如下输出：

```text
Commands:
  mcp   Start the MCP (Model Context Protocol) server
  init  Initialize agent environment configuration for detected agents
```

MCP 笔者个人不推荐使用，太吃上下文了。

### 初始化本地编排项目

先创建 infra 目录：

```bash
mkdir -p infra/local-dev
cd infra/local-dev
```

用 `aspire init` 创建默认的 Aspire 项目模板，目前支持 C# 和 TypeScript，这里选择 TypeScript。完成后它会询问是否要生成对应的 skill，选择后会自动生成 claude、github 和 opencode 的 aspire skill 和 playwright skill，生成后按需保留即可，也可以挪到项目根目录对应的文件夹中。

我个人推荐让 Agent 自己生成一个 infra Agent 来控制对 Aspire 的代码修改，在其中描述清楚项目结构、Agent 职责、项目的依赖关系，例如：

```text
为这个项目准备一个运维 agent，并接入 aspire，相关代码放置在 infra 文件夹
当前 infra 目录结构
- infra/AGENTS.md 指示如何编辑 infra 相关项目，这个 AGENT 收集各个项目中需求的基础设施能力，如 `postgresql`，并使用 `aspire` 工具添加相关的集成(integration)到对应的 aspire 项目中（参考 aspire 的 skill）
- infra/local-dev/ - 这是用于本地开发的 aspire project
```

### 让 Agent 编写 apphost.ts

当 Agent 把 `agents.md` 生成好之后，让 AI 自动分析项目依赖，并编写 `apphost.ts`：

```text
扫描其他项目的引用和依赖，分析项目之间的依赖关系，并根据其技术栈使用 aspire docs search 查找如何集成到 aspire 中，并修改 infra/local-dev 中的 apphost.ts 完成项目的集成。扫描项目中的环境变量，在 apphost.ts 中体现，如果是引用其他基础设施和项目，使用 aspire 的 withReference/withEnvironment 功能进行引用。如果需要帮助请使用 aspire docs search <keyword> 进行检索。
```

Agent 会自动根据 aspire skill 按技术栈添加引用，最终 `apphost.ts` 会长这样：

```typescript
import { createBuilder } from './.modules/aspire.js';

const builder = await createBuilder();

const redis = await builder.addContainer('cache', 'redis:latest');
const postgres = await builder.addPostgres('pgsql');
const db = await postgres.addDatabase('db');

const backend = await builder.addJavaScriptApp('backend', '../../backend', {
  runScriptName: 'dev',
})
  .withBun()
  .withReference(db)
  .withReference(redis)
  .withHttpEndpoint({ env: 'PORT' });

const frontend = await builder.addViteApp('frontend', '../../frontend')
  .withBun()
  .withReference(backend)
  .withEnvironment('VITE_API_BASE_URL', await backend.getEndpoint('http'));

await builder.build().run();
```

之后就可以让 AI 直接用 Aspire 把整个项目拉起来，或者进行集成测试 / API 测试 / e2e 测试的编写，**甚至可以引入一个测试 Agent，配合 Playwright 的 skill，对指定分支进行测试**。

## 一些技巧和问题

### eslint 报错

`aspire init` 产出的默认项目不含 `tsconfig.json`，但 eslint 只认这个文件而不认 `tsconfig.apphost.json`。我们创建一个 `tsconfig.json`，直接 extends 一下即可：

```json
{
  "extends": ["tsconfig.apphost.json"]
}
```

### 构造复杂环境变量

`withReference` 只会把默认的环境变量注入到环境中，比如 PostgreSQL 会注入 `DB_JDBCCONNECTIONSTRING`、`DB_URI` 这种。在我们不想改代码，或现有环境变量无法直接使用的时候，可以自己引用一下，或者重新构造。

#### 引用一个已有的环境变量

如果某个环境变量已经满足需求，只需要换个名字引用，可以使用 `withEnvironmentCallback`。例如已经有了 `DB_URI`，把它别名成 `DATABASE_URL`：

```typescript
.withEnvironmentCallback(async (cb) => {
  cb.environmentVariables.set('DATABASE_URL', await cb.environmentVariables.get('DB_URI'));
})
```

#### 使用 `refExpr` 自定义构造

如果默认注入的环境变量都不是你想要的，可以用 `refExpr` 自己构造：

```typescript
import { refExpr } from './.modules/aspire.js';

const pg = await builder.addPostgres('pgsql');
const db = await pg.addDatabase('db');

async function makePgsqlConnectionString() {
  const user = await pg.userNameReference.get();
  const password = await pg.passwordParameter.get();
  const host = await pg.host.get();
  const port = await pg.port.get();
  const dbName = await db.databaseName.get();

  return refExpr`postgresql://${user}:${password}@${host}:${port}/${dbName}?schema=public`;
}

const pgsqlRef = await makePgsqlConnectionString();

const backend = await builder.addJavaScriptApp('backend', '../../backend', {
  runScriptName: 'dev',
})
  .withBun()
  .withEnvironment('DATABASE_URL', pgsqlRef);
```

### 增加自定义扩展

如果我们定义了很多个自定义的扩展，可以通过函数来复用代码，例如把公共的后端服务模板抽出来（`db` 来自外层作用域）：

```typescript
import { DistributedApplicationBuilder } from './.modules/aspire.js';

async function backendProjectTemplate(builder: DistributedApplicationBuilder, folder: string, script = 'dev') {
  return await builder.addJavaScriptApp(`backend-${folder}`, `../../${folder}`, {
    runScriptName: script,
  })
    .withBun()
    .withReference(db);
}

const backendA = await backendProjectTemplate(builder, 'backend-a');
const backendB = await backendProjectTemplate(builder, 'backend-b');
```

如果想追求类似 C# 扩展方法的体验，可以使用 monkey patch 的方式把方法注入到 `DistributedApplicationBuilder` 中，例如我自定义接入的 minio：

```typescript
import { DistributedApplicationBuilder, ContainerResource, ParameterResource } from './.modules/aspire.js';

// 定义 MinIoResource，让外部调用时能感知到 user 和 password
export interface MinIoResource extends ContainerResource {
  user: ParameterResource;
  password: ParameterResource;
}

DistributedApplicationBuilder.prototype.addMinIoContainer = async function (name: string) {
  // 生成 user / password 参数
  const user = await this.addParameterWithValue(`${name}-rootuser`, 'minioadmin');
  const password = await this.addParameterWithGeneratedValue(`${name}-rootpassword`, {});

  // 使用 addContainer 构造 minio，并注入 root 账号信息
  const minio = (await this
    .addContainer(name, 'minio/minio:latest')
    .withEnvironment('MINIO_ROOT_USER', user)
    .withEnvironment('MINIO_ROOT_PASSWORD', password)) as MinIoResource;

  minio.user = user;
  minio.password = password;
  return minio;
};

// 给 TS 类型打个补丁
declare module './.modules/aspire.js' {
  interface DistributedApplicationBuilder {
    addMinIoContainer: (name: string) => Promise<MinIoResource>;
  }
}
```

在外部调用时，直接像内置 API 一样使用即可：

```typescript
const builder = await createBuilder();
const minio = await builder.addMinIoContainer('minio');
```

## 总结

接入 Aspire 之后，整个微服务项目的本地开发 / 联调 / 测试环境就被统一到一个编排脚本里：Agent 只需要看一份 `apphost.ts` 就能理解全局拓扑，用一条命令拉起所有服务，还能自动生成部署清单，配合测试 Agent 甚至能做到"一键起环境、自动跑测试"。如果你也在用多 Agent 开发微服务，值得一试。
