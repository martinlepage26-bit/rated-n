import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './overrides.css'

const capabilityMap = {
  leadership: ['managed', 'supervised', 'led', 'leadership', 'team lead'],
  operations: ['operations', 'schedule', 'scheduling', 'workflow', 'logistics', 'process'],
  training: ['trained', 'training', 'coaching', 'onboarded', 'mentored'],
  clients: ['customer', 'client', 'stakeholder', 'account', 'escalation'],
  projects: ['project', 'program', 'roadmap', 'delivery', 'coordinated'],
  analysis: ['analysis', 'research', 'report', 'data', 'insight', 'evaluation'],
  communication: ['communication', 'presented', 'writing', 'wrote', 'facilitated'],
  technology: ['software', 'crm', 'salesforce', 'ai', 'automation', 'technical'],
  improvement: ['improved', 'optimization', 'streamlined', 'efficient', 'redesigned'],
}

const roleCatalog = [
  { title: 'Program Manager', category: 'Direct', needs: ['projects', 'leadership', 'communication', 'operations'], gaps: ['portfolio governance', 'budget ownership'] },
  { title: 'Implementation Manager', category: 'Direct', needs: ['clients', 'training', 'projects', 'technology'], gaps: ['implementation methodology', 'platform expertise'] },
  { title: 'Operations Manager', category: 'Direct', needs: ['operations', 'leadership', 'improvement', 'analysis'], gaps: ['financial planning', 'department strategy'] },
  { title: 'Business Analyst', category: 'Adjacent', needs: ['analysis', 'communication', 'improvement', 'technology'], gaps: ['requirements documentation', 'analytics tooling'] },
  { title: 'Research Operations Manager', category: 'Unexpected', needs: ['analysis', 'operations', 'projects', 'communication'], gaps: ['research governance', 'study operations'] },
  { title: 'Customer Success Manager', category: 'Adjacent', needs: ['clients', 'communication', 'training', 'technology'], gaps: ['success metrics', 'renewal strategy'] },
  { title: 'AI Operations Specialist', category: 'Unexpected', needs: ['technology', 'operations', 'analysis', 'improvement'], gaps: ['AI workflow design', 'model evaluation'] },
]

function analyze(text) {
  const source = text.toLowerCase()
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(item => item.trim()).filter(Boolean)
  const capabilities = Object.entries(capabilityMap).flatMap(([name, terms]) => {
    const term = terms.find(item => source.includes(item))
    if (!term) return []
    const evidence = sentences.find(sentence => sentence.toLowerCase().includes(term)) || `You mentioned ${term}.`
    return [{ name, label: name.replace(/^./, name[0].toUpperCase()), evidence }]
  })
  const found = new Set(capabilities.map(item => item.name))
  const roles = roleCatalog.map(role => {
    const matched = role.needs.filter(need => found.has(need))
    const missing = role.needs.filter(need => !found.has(need))
    const score = Math.min(96, Math.max(32, Math.round(30 + (matched.length / role.needs.length) * 62 + Math.min(text.length / 80, 4))))
    const category = score >= 76 ? role.category : score >= 56 ? 'Adjacent' : 'Stretch'
    return { ...role, category, score, matched, missing, evidence: capabilities.filter(item => matched.includes(item.name)) }
  }).sort((a, b) => b.score - a.score)
  return { capabilities, roles }
}

function App() {
  const [view, setView] = useState('home')
  const [source, setSource] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const discover = () => { const result = analyze(source); setAnalysis(result); setSelected(result.roles[0]); setView('results') }
  const loadFile = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.txt')) { notify('For this local MVP, paste PDF or DOCX content into the text box. Plain-text files work directly.'); return }
    const reader = new FileReader()
    reader.onload = () => { setSource(String(reader.result || '')); notify(`${file.name} loaded.`) }
    reader.readAsText(file)
  }
  const props = { setView, toast, notify }
  if (view === 'results' && analysis) return <Results {...props} analysis={analysis} selected={selected} setSelected={setSelected} />
  if (view === 'detail' && selected) return <Detail {...props} role={selected} />
  return <Home {...props} source={source} setSource={setSource} discover={discover} loadFile={loadFile} />
}

const Header = ({ setView }) => <header><button className="wordmark" onClick={() => setView('home')}>Rated <i>N</i></button><nav><button onClick={() => setView('home')}>How it works</button><button onClick={() => setView('home')}>Sign in</button><button className="nav-cta" onClick={() => setView('home')}>Get started</button></nav></header>
const Toast = ({ toast }) => toast && <div className="toast" role="status">{toast}</div>

function Home({ source, setSource, discover, loadFile, setView, toast, notify }) {
  const example = 'Managed a frontline team of 12 employees, scheduled weekly operations, trained new hires, resolved customer escalations, prepared performance reports, and improved an intake process.'
  return <main><Header setView={setView}/><section className="hero"><div className="hero-copy"><p className="kicker">Your career, seen differently</p><h1>Discover what you’re qualified <em>to become.</em></h1><p className="lede">Add your experience. Rated N extracts demonstrated capabilities and maps them to credible career paths.</p></div><div className="hero-art"><img src="/career-map.png" alt="Abstract professional connections"/><div className="proof"><strong>1</strong><span>clearer map of what<br/>you can do next</span></div></div></section><section className="workspace functional"><div className="profile-panel"><div className="panel-top"><div><p className="eyebrow">Start your discovery</p><h3>What have you actually done?</h3></div><span className="status">Private in this browser</span></div><p>Paste experience from a résumé, LinkedIn profile, project history, or career notes. Your text is analyzed locally in this prototype and is not uploaded.</p><label className="field-label" htmlFor="profile-text">Your experience</label><textarea id="profile-text" value={source} onChange={event => setSource(event.target.value)} placeholder="Example: I managed a team, trained colleagues, coordinated projects, worked with clients, and improved operational processes..."/><div className="intake-actions"><button className="primary" onClick={discover} disabled={source.trim().length < 40}>Analyze my experience <b>→</b></button><button className="text-btn" onClick={() => setSource(example)}>Use an example</button><label className="file-upload">Upload .txt<input type="file" accept="text/plain,.txt" onChange={loadFile}/></label></div>{source.trim() && <p className="input-status">{source.trim().split(/\s+/).length} words ready to analyze</p>}</div><div className="question-panel"><p className="eyebrow">How it works</p><h3>Evidence, then opportunity.</h3><ol className="steps"><li><b>01</b><span>Extract capabilities from your words</span></li><li><b>02</b><span>Compare them to role requirements</span></li><li><b>03</b><span>Show your strongest evidence and gaps</span></li></ol><button className="text-btn inverse" onClick={() => notify('Enter at least 40 characters to begin your analysis.')}>What happens to my data? →</button></div></section><Toast toast={toast}/></main>
}

function Results({ analysis, selected, setSelected, setView, toast, notify }) { return <main><Header setView={setView}/><section className="results-head"><div><button className="back" onClick={() => setView('home')}>← Edit experience</button><p className="kicker">Career discovery · your local analysis</p><h1>These paths fit more<br/>than your <em>past titles.</em></h1></div><aside><strong>{analysis.capabilities.length}</strong><span>capabilities found<br/>in your career story</span></aside></section><section className="capability-strip"><span>Found in your text</span>{analysis.capabilities.map(item => <b key={item.name}>{item.label}</b>)}</section><section className="results-layout"><div className="role-list"><p className="list-label">Opportunities ranked by demonstrated overlap</p>{analysis.roles.map(role => <button key={role.title} className={'role-card '+(selected?.title === role.title ? 'selected' : '')} onClick={() => { setSelected(role); setView('detail') }}><span className={'match-dot '+(role.category === 'Unexpected' ? 'moss' : role.category === 'Adjacent' ? 'sand' : 'coral')}>{role.score}</span><span className="role-copy"><small>{role.category}</small><strong>{role.title}</strong><em>{role.matched.length} of {role.needs.length} core capability areas demonstrated</em></span><b>→</b></button>)}</div><aside className="signal"><p className="eyebrow">How to read this</p><h2>Scores reflect overlap—not a hiring guarantee.</h2><p>A score is calculated from capability evidence in the text you provided. Open a role to see the exact evidence and the gaps.</p><button className="text-btn" onClick={() => notify('Every score in this prototype is calculated from the current text only.')}>See scoring logic →</button></aside></section><Toast toast={toast}/></main> }

function Detail({ role, setView, toast, notify }) { return <main><Header setView={setView}/><section className="detail-hero"><button className="back" onClick={() => setView('results')}>← All opportunities</button><div className="role-heading"><div><p className="kicker">{role.category} opportunity</p><h1>{role.title}</h1><p>{role.matched.length} of {role.needs.length} core capabilities for this path were found in your provided experience.</p></div><div className="big-score"><strong>{role.score}%</strong><span>evidence overlap</span></div></div></section><section className="detail-grid"><article className="evidence"><p className="eyebrow">Your supporting evidence</p><h2>We only use what you gave us.</h2>{role.evidence.length ? role.evidence.map(item => <div className="quote" key={item.name}>“{item.evidence}”<small>Matched capability · {item.label}</small></div>) : <p>No direct evidence was found for this role yet. Add more concrete accomplishments and tools to improve the analysis.</p>}<div className="chips">{role.matched.map(item => <span key={item}>{item}</span>)}</div></article><aside className="scorecard"><p className="eyebrow">Match detail</p><div className="score-row"><span>Demonstrated areas</span><b>{role.matched.length}/{role.needs.length}</b><i><i style={{width:(role.matched.length / role.needs.length) * 100+'%'}}/></i></div><div className="score-row"><span>Evidence overlap</span><b>{role.score}%</b><i><i style={{width:role.score+'%'}}/></i></div><p className="gap-title">Next gaps to close</p>{role.gaps.map(gap => <div className="gap" key={gap}>{gap}</div>)}</aside></section><section className="path"><div><p className="eyebrow">A realistic next step</p><h2>Turn your evidence into a transition plan.</h2></div><ol><li><b>01</b><span>Review the highlighted evidence for accuracy</span></li><li><b>02</b><span>Build one practical proof point around {role.gaps[0]}</span></li><li><b>03</b><span>Position your experience for {role.title} opportunities</span></li></ol><button className="primary" onClick={() => notify('Saved locally for this session.')}>Save this path <b>→</b></button></section><Toast toast={toast}/></main> }

createRoot(document.getElementById('root')).render(<App />)
