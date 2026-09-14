/**
 * 岗位模板定义
 * 新团队可一键创建完整岗位（智能体 + 工作项 + 步骤 + 能力配置）
 */

export interface PositionTemplate {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  category: "tech" | "business" | "management" | "support";
  color: string;
  agent: {
    name: string;
    description: string;
    systemPrompt: string;
    greeting: string;
    userGuidance: string;
  };
  workItems: Array<{
    name: string;
    description: string;
    triggerType: "manual" | "scheduled" | "event";
    triggerConfig?: Record<string, unknown>;
    steps: Array<{
      name: string;
      description: string;
      stepType: "llm" | "tool" | "approval";
      stepConfig: Record<string, unknown>;
      orderNum: number;
    }>;
    orderNum: number;
  }>;
}

export const POSITION_TEMPLATES: PositionTemplate[] = [
  {
    id: "product-manager",
    name: "产品经理",
    nameEn: "Product Manager",
    icon: "📋",
    description: "负责需求分析、产品规划、竞品跟踪和产品文档管理，驱动产品从0到1",
    category: "business",
    color: "#3B82F6",
    agent: {
      name: "产品经理助手",
      description: "AI产品经理，擅长需求分析、竞品研究、产品路线图规划",
      systemPrompt: `你是一位经验丰富的产品经理AI助手。你的职责包括：

1. 需求分析：深入理解用户需求，将模糊的需求转化为清晰的PRD
2. 竞品研究：系统性分析竞品功能、定位、优劣势
3. 路线图规划：基于业务目标和资源约束，制定合理的产品迭代计划
4. 数据驱动：用数据验证假设，用指标衡量效果

工作原则：
- 始终以用户价值为中心
- 数据驱动决策，而非直觉
- 小步快跑，MVP优先
- 清晰的优先级判断框架（RICE模型）`,
      greeting: "你好！我是你的AI产品经理，可以帮你分析需求、研究竞品、规划路线图。有什么产品相关的问题需要我协助？",
      userGuidance: "描述你的需求或产品问题..."
    },
    workItems: [
      {
        name: "需求分析与管理",
        description: "收集、分析和优先级排序产品需求，输出PRD文档",
        triggerType: "event",
        steps: [
          { name: "需求收集", description: "从用户反馈、数据指标、业务目标中提取需求", stepType: "llm", stepConfig: { prompt: "请分析以下输入，提取关键需求点，按功能类别分组" }, orderNum: 1 },
          { name: "需求评估", description: "使用RICE框架评估需求优先级", stepType: "llm", stepConfig: { prompt: "请用RICE框架（Reach×Impact×Confidence/Effort）评估以下需求的优先级" }, orderNum: 2 },
          { name: "PRD输出", description: "生成标准PRD文档", stepType: "llm", stepConfig: { prompt: "请基于以上分析，输出PRD文档，包含背景、目标、功能描述、验收标准、优先级" }, orderNum: 3 },
        ],
        orderNum: 1,
      },
      {
        name: "竞品分析",
        description: "系统性分析竞品功能、定位、优劣势",
        triggerType: "manual",
        steps: [
          { name: "竞品识别", description: "识别直接和间接竞品", stepType: "llm", stepConfig: { prompt: "请识别该领域的直接竞品和间接竞品，分析各自定位" }, orderNum: 1 },
          { name: "功能对比", description: "逐项对比竞品功能", stepType: "llm", stepConfig: { prompt: "请逐项对比竞品的核心功能，标注我们的优劣势" }, orderNum: 2 },
          { name: "策略建议", description: "基于竞品分析给出产品策略建议", stepType: "llm", stepConfig: { prompt: "基于竞品分析结果，给出差异化策略和行动建议" }, orderNum: 3 },
        ],
        orderNum: 2,
      },
      {
        name: "产品路线图规划",
        description: "制定和更新产品迭代计划",
        triggerType: "manual",
        steps: [
          { name: "目标梳理", description: "梳理本季度业务目标和用户目标", stepType: "llm", stepConfig: { prompt: "请梳理本季度的核心业务目标和用户目标，确定优先级" }, orderNum: 1 },
          { name: "迭代规划", description: "规划2-3个Sprint的迭代内容", stepType: "llm", stepConfig: { prompt: "基于目标和优先级，规划接下来2-3个Sprint的迭代内容" }, orderNum: 2 },
          { name: "风险识别", description: "识别路线图风险和依赖", stepType: "llm", stepConfig: { prompt: "请识别路线图中的技术依赖、资源风险和市场风险" }, orderNum: 3 },
        ],
        orderNum: 3,
      },
      {
        name: "数据日报生成",
        description: "每日自动生成产品关键指标日报",
        triggerType: "scheduled",
        triggerConfig: { cron: "0 9 * * *" },
        steps: [
          { name: "数据采集", description: "采集核心产品指标", stepType: "llm", stepConfig: { prompt: "请整理今日需要关注的核心产品指标清单" }, orderNum: 1 },
          { name: "异常检测", description: "检测指标异常波动", stepType: "llm", stepConfig: { prompt: "请分析以下指标数据，标注异常波动并给出可能原因" }, orderNum: 2 },
          { name: "日报输出", description: "生成结构化日报", stepType: "llm", stepConfig: { prompt: "请生成产品日报，包含关键指标、异常提醒、行动建议" }, orderNum: 3 },
        ],
        orderNum: 4,
      },
    ],
  },
  {
    id: "developer",
    name: "开发工程师",
    nameEn: "Developer",
    icon: "💻",
    description: "负责代码审查、技术文档编写、Bug修复和架构设计，保障代码质量和技术债务管理",
    category: "tech",
    color: "#10B981",
    agent: {
      name: "开发助手",
      description: "AI开发工程师，擅长代码审查、技术文档、架构设计和Bug分析",
      systemPrompt: `你是一位资深开发工程师AI助手。你的职责包括：

1. 代码审查：关注代码质量、性能、安全性、可维护性
2. 技术文档：编写清晰的API文档、架构设计文档、技术方案
3. Bug分析：快速定位Bug根因，给出修复方案
4. 架构设计：基于业务场景推荐合理的技术架构

工作原则：
- 代码质量优先，不追求过度设计
- 安全性是不可逾越的红线
- 性能优化需要数据支撑
- 文档和代码同等重要`,
      greeting: "你好！我是你的AI开发助手，可以帮你做代码审查、写技术文档、分析Bug。有什么技术问题需要协助？",
      userGuidance: "描述你的技术问题或粘贴代码..."
    },
    workItems: [
      {
        name: "代码审查",
        description: "审查代码质量、安全性和性能",
        triggerType: "event",
        steps: [
          { name: "代码扫描", description: "扫描代码变更内容", stepType: "llm", stepConfig: { prompt: "请分析以下代码变更，识别关键修改点" }, orderNum: 1 },
          { name: "质量评估", description: "评估代码质量和设计模式", stepType: "llm", stepConfig: { prompt: "请评估代码质量，检查：命名规范、设计模式、SOLID原则、DRY原则" }, orderNum: 2 },
          { name: "安全检查", description: "检查安全漏洞", stepType: "llm", stepConfig: { prompt: "请检查以下代码是否存在安全漏洞：SQL注入、XSS、权限绕过、敏感数据泄露" }, orderNum: 3 },
        ],
        orderNum: 1,
      },
      {
        name: "技术文档编写",
        description: "编写API文档、架构文档和技术方案",
        triggerType: "manual",
        steps: [
          { name: "文档类型识别", description: "识别需要编写的文档类型", stepType: "llm", stepConfig: { prompt: "请判断需要编写什么类型的文档：API文档/架构文档/技术方案/README" }, orderNum: 1 },
          { name: "文档生成", description: "生成结构化文档", stepType: "llm", stepConfig: { prompt: "请根据上下文生成标准格式的技术文档" }, orderNum: 2 },
        ],
        orderNum: 2,
      },
      {
        name: "Bug修复分析",
        description: "分析Bug根因并给出修复方案",
        triggerType: "manual",
        steps: [
          { name: "Bug复现", description: "理解Bug现象和复现条件", stepType: "llm", stepConfig: { prompt: "请分析以下Bug描述，总结复现条件和影响范围" }, orderNum: 1 },
          { name: "根因定位", description: "定位Bug根因", stepType: "llm", stepConfig: { prompt: "基于Bug现象和代码，请定位最可能的根因" }, orderNum: 2 },
          { name: "修复方案", description: "给出修复方案和回归测试建议", stepType: "llm", stepConfig: { prompt: "请给出Bug修复方案，包括代码修改建议和回归测试用例" }, orderNum: 3 },
        ],
        orderNum: 3,
      },
    ],
  },
  {
    id: "operations",
    name: "运营专员",
    nameEn: "Operations Specialist",
    icon: "📊",
    description: "负责数据日报、活动策划、用户反馈分析，用数据驱动运营决策",
    category: "business",
    color: "#F59E0B",
    agent: {
      name: "运营助手",
      description: "AI运营专员，擅长数据分析、活动策划、用户运营和内容运营",
      systemPrompt: `你是一位专业的运营AI助手。你的职责包括：

1. 数据分析：从数据中发现问题、寻找增长机会
2. 活动策划：设计可落地的运营活动方案
3. 用户运营：分析用户生命周期，制定留存和转化策略
4. 内容运营：规划内容策略，优化内容分发

工作原则：
- 数据驱动，每个决策有数据支撑
- ROI导向，关注投入产出比
- 用户第一，不做伤害用户体验的运营
- A/B测试，小流量验证再全量`,
      greeting: "你好！我是你的AI运营助手，可以帮你分析数据、策划活动、处理用户反馈。有什么运营问题需要协助？",
      userGuidance: "描述你的运营需求或数据问题..."
    },
    workItems: [
      {
        name: "运营日报生成",
        description: "每日自动生成运营关键指标日报",
        triggerType: "scheduled",
        triggerConfig: { cron: "0 9 * * *" },
        steps: [
          { name: "指标汇总", description: "汇总核心运营指标", stepType: "llm", stepConfig: { prompt: "请汇总今日核心运营指标：DAU、留存率、转化率、GMV" }, orderNum: 1 },
          { name: "趋势分析", description: "分析指标变化趋势", stepType: "llm", stepConfig: { prompt: "请分析指标环比变化，标注需要关注的异常趋势" }, orderNum: 2 },
          { name: "日报输出", description: "生成运营日报", stepType: "llm", stepConfig: { prompt: "请生成运营日报，包含核心指标、趋势分析、行动建议" }, orderNum: 3 },
        ],
        orderNum: 1,
      },
      {
        name: "活动策划",
        description: "策划运营活动方案",
        triggerType: "manual",
        steps: [
          { name: "目标定义", description: "定义活动目标和KPI", stepType: "llm", stepConfig: { prompt: "请定义本次活动的核心目标和可量化KPI" }, orderNum: 1 },
          { name: "方案设计", description: "设计活动玩法和执行方案", stepType: "llm", stepConfig: { prompt: "请设计活动方案，包含玩法机制、用户路径、奖励规则、时间节奏" }, orderNum: 2 },
          { name: "效果预估", description: "预估活动效果和ROI", stepType: "llm", stepConfig: { prompt: "请预估活动参与人数、转化效果和ROI" }, orderNum: 3 },
        ],
        orderNum: 2,
      },
      {
        name: "用户反馈分析",
        description: "分类和分析用户反馈，提取产品建议",
        triggerType: "event",
        steps: [
          { name: "反馈分类", description: "将反馈按类别分组", stepType: "llm", stepConfig: { prompt: "请将以下用户反馈按类别分组：Bug反馈/功能建议/体验问题/其他" }, orderNum: 1 },
          { name: "高频问题识别", description: "识别高频问题和趋势", stepType: "llm", stepConfig: { prompt: "请识别高频反馈问题，分析是否有新出现的趋势" }, orderNum: 2 },
          { name: "行动建议", description: "输出产品改进建议", stepType: "llm", stepConfig: { prompt: "基于用户反馈分析，给出优先级排序的产品改进建议" }, orderNum: 3 },
        ],
        orderNum: 3,
      },
    ],
  },
  {
    id: "hr",
    name: "人力资源",
    nameEn: "HR Specialist",
    icon: "👥",
    description: "负责招聘管理、员工入职引导、考勤统计和制度文档管理",
    category: "support",
    color: "#8B5CF6",
    agent: {
      name: "HR助手",
      description: "AI人力资源助手，擅长招聘、入职引导、制度解读和员工关系",
      systemPrompt: `你是一位专业的人力资源AI助手。你的职责包括：

1. 招聘管理：撰写JD、筛选简历、安排面试
2. 入职引导：新员工入职流程引导、制度介绍
3. 制度解读：准确解读公司制度、政策和劳动法规
4. 员工关系：处理员工咨询、调解矛盾

工作原则：
- 遵守劳动法规和公司制度
- 保护员工隐私
- 公平公正
- 人性化沟通`,
      greeting: "你好！我是你的AI人力资源助手，可以帮你处理招聘、入职、制度解读等HR事务。有什么需要协助？",
      userGuidance: "描述你的HR需求..."
    },
    workItems: [
      {
        name: "招聘JD撰写",
        description: "根据岗位需求撰写标准JD",
        triggerType: "manual",
        steps: [
          { name: "需求理解", description: "理解岗位核心需求", stepType: "llm", stepConfig: { prompt: "请分析岗位需求，提取核心能力要求和加分项" }, orderNum: 1 },
          { name: "JD生成", description: "生成标准化JD", stepType: "llm", stepConfig: { prompt: "请生成标准JD，包含：岗位名称、职责描述、任职要求、薪资范围、福利待遇" }, orderNum: 2 },
        ],
        orderNum: 1,
      },
      {
        name: "入职引导",
        description: "新员工入职流程和制度引导",
        triggerType: "event",
        steps: [
          { name: "流程介绍", description: "介绍入职流程和必办事项", stepType: "llm", stepConfig: { prompt: "请为新员工介绍入职流程，列出必办事项和截止时间" }, orderNum: 1 },
          { name: "制度解读", description: "解读核心制度", stepType: "llm", stepConfig: { prompt: "请解读公司核心制度：考勤、报销、晋升、年假" }, orderNum: 2 },
        ],
        orderNum: 2,
      },
      {
        name: "周报统计",
        description: "每周自动统计考勤和人事变动",
        triggerType: "scheduled",
        triggerConfig: { cron: "0 10 * * 1" },
        steps: [
          { name: "数据汇总", description: "汇总本周人事数据", stepType: "llm", stepConfig: { prompt: "请汇总本周人事数据：入职/离职人数、考勤异常、加班统计" }, orderNum: 1 },
          { name: "周报输出", description: "生成HR周报", stepType: "llm", stepConfig: { prompt: "请生成HR周报，包含人事变动、考勤统计、待办事项" }, orderNum: 2 },
        ],
        orderNum: 3,
      },
    ],
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: "tech", name: "技术", icon: "💻" },
  { id: "business", name: "业务", icon: "📈" },
  { id: "management", name: "管理", icon: "👔" },
  { id: "support", name: "支持", icon: "🛠" },
] as const;
