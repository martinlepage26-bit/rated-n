export const capabilityMap = {
  leadership: { label: 'Leadership', terms: ['managed', 'managing', 'manager', 'supervised', 'led', 'leadership', 'team lead'] },
  operations: { label: 'Operations', terms: ['operations', 'scheduled', 'scheduling', 'workflow', 'logistics', 'process'] },
  training: { label: 'Training', terms: ['trained', 'training', 'coached', 'coaching', 'onboarded', 'mentored'] },
  clients: { label: 'Client work', terms: ['customer', 'customers', 'client', 'clients', 'stakeholder', 'stakeholders', 'account', 'escalation', 'escalations'] },
  projects: { label: 'Project delivery', terms: ['project', 'projects', 'program', 'programs', 'roadmap', 'delivery', 'coordinated', 'coordinating'] },
  analysis: { label: 'Analysis', terms: ['analysis', 'analyzed', 'research', 'report', 'reports', 'reporting', 'data', 'insight', 'evaluation'] },
  communication: { label: 'Communication', terms: ['communication', 'communicated', 'presented', 'presentation', 'writing', 'wrote', 'facilitated'] },
  technology: { label: 'Technology', terms: ['software', 'crm', 'salesforce', 'automation', 'technical', 'python', 'javascript', 'typescript', 'sql', 'excel', 'artificial intelligence', 'machine learning'] },
  improvement: { label: 'Process improvement', terms: ['improved', 'improvement', 'optimized', 'optimization', 'streamlined', 'efficient', 'efficiency', 'redesigned'] },
  finance: { label: 'Financial management', terms: ['budget', 'budgets', 'budgeting', 'financial', 'finance', 'forecast', 'forecasting', 'revenue'] },
}

const developmentSignals = {
  portfolioGovernance: { label: 'portfolio governance', terms: ['portfolio governance', 'program governance', 'steering committee'] },
  budgetOwnership: { label: 'budget ownership', terms: ['managed budget', 'managed budgets', 'budget ownership', 'owned budget', 'owned budgets', 'budgeting'] },
  implementationMethod: { label: 'implementation methodology', terms: ['implementation methodology', 'implementation lifecycle', 'deployment methodology'] },
  platformExpertise: { label: 'platform expertise', terms: ['salesforce', 'hubspot', 'servicenow', 'workday', 'jira'] },
  financialPlanning: { label: 'financial planning', terms: ['financial planning', 'budget planning', 'forecasting'] },
  departmentStrategy: { label: 'department strategy', terms: ['department strategy', 'operating strategy', 'strategic plan'] },
  requirements: { label: 'requirements documentation', terms: ['requirements documentation', 'business requirements', 'user stories', 'acceptance criteria'] },
  analyticsTools: { label: 'analytics tooling', terms: ['tableau', 'power bi', 'looker', 'sql', 'excel'] },
  researchGovernance: { label: 'research governance', terms: ['research governance', 'ethics review', 'irb', 'research protocol'] },
  studyOperations: { label: 'study operations', terms: ['study operations', 'participant recruitment', 'research study'] },
  successMetrics: { label: 'success metrics', terms: ['customer health', 'success metrics', 'adoption metrics', 'nps'] },
  renewalStrategy: { label: 'renewal strategy', terms: ['renewal', 'renewals', 'retention strategy', 'churn'] },
  aiWorkflow: { label: 'AI workflow design', terms: ['ai workflow', 'llm workflow', 'prompt pipeline', 'machine learning workflow'] },
  modelEvaluation: { label: 'model evaluation', terms: ['model evaluation', 'evals', 'benchmarking models', 'quality evaluation'] },
}

export const roleCatalog = [
  { title: 'Program Manager', category: 'Direct', needs: ['projects', 'leadership', 'communication', 'operations'], development: ['portfolioGovernance', 'budgetOwnership'] },
  { title: 'Implementation Manager', category: 'Direct', needs: ['clients', 'training', 'projects', 'technology'], development: ['implementationMethod', 'platformExpertise'] },
  { title: 'Operations Manager', category: 'Direct', needs: ['operations', 'leadership', 'improvement', 'analysis'], development: ['financialPlanning', 'departmentStrategy'] },
  { title: 'Business Analyst', category: 'Adjacent', needs: ['analysis', 'communication', 'improvement', 'technology'], development: ['requirements', 'analyticsTools'] },
  { title: 'Research Operations Manager', category: 'Unexpected', needs: ['analysis', 'operations', 'projects', 'communication'], development: ['researchGovernance', 'studyOperations'] },
  { title: 'Customer Success Manager', category: 'Adjacent', needs: ['clients', 'communication', 'training', 'technology'], development: ['successMetrics', 'renewalStrategy'] },
  { title: 'AI Operations Specialist', category: 'Unexpected', needs: ['technology', 'operations', 'analysis', 'improvement'], development: ['aiWorkflow', 'modelEvaluation'] },
]

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matchesTerm = (text, term) => new RegExp(`(^|\\W)${escapeRegex(term)}(?=$|\\W)`, 'i').test(text)
const findTerm = (text, terms) => terms.find(term => matchesTerm(text, term))

function evidenceFragments(text) {
  return text
    .split(/(?<=[.!?;])\s+|\n+|•+|,\s+(?=[A-Za-z])/)
    .map(fragment => fragment.trim().replace(/[.;,]+$/, ''))
    .filter(Boolean)
}

export function analyzeCareer(text) {
  const fragments = evidenceFragments(text)
  const capabilities = Object.entries(capabilityMap).flatMap(([name, definition]) => {
    const term = findTerm(text, definition.terms)
    if (!term) return []
    const evidence = fragments.find(fragment => matchesTerm(fragment, term)) || text.trim()
    return [{ name, label: definition.label, term, evidence }]
  })
  const foundCapabilities = new Set(capabilities.map(item => item.name))

  const roles = roleCatalog.map(role => {
    const matched = role.needs.filter(need => foundCapabilities.has(need))
    const missing = role.needs.filter(need => !foundCapabilities.has(need))
    const demonstratedDevelopment = role.development.filter(key => findTerm(text, developmentSignals[key].terms))
    const coreScore = matched.length / role.needs.length
    const developmentScore = demonstratedDevelopment.length / role.development.length
    const score = Math.round(coreScore * 80 + developmentScore * 20)
    const category = score >= 75 ? role.category : score >= 50 ? 'Adjacent' : 'Stretch'
    const gaps = [
      ...role.development.filter(key => !demonstratedDevelopment.includes(key)).map(key => developmentSignals[key].label),
      ...missing.map(key => capabilityMap[key].label.toLowerCase()),
    ].slice(0, 3)
    return {
      ...role,
      category,
      score,
      matched,
      missing,
      gaps,
      demonstratedDevelopment,
      evidence: capabilities.filter(item => matched.includes(item.name)),
    }
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  return { capabilities, roles, hasEvidence: capabilities.length > 0 }
}
