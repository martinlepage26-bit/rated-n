import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { analyzeCareer, capabilityMap } from './careerEngine.js'
import './styles.css'
import './overrides.css'

const exampleText = 'Managed a frontline team of 12 employees, scheduled weekly operations, trained new hires, resolved customer escalations, prepared performance reports, managed budgets, and improved an intake process.'

function getSavedRoles() {
  try { return JSON.parse(localStorage.getItem('rated-n:saved-roles') || '[]') }
  catch { return [] }
}

function App() {
  const [view, setView] = useState('home')
  const [source, setSource] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null)
  const [savedRoles, setSavedRoles] = useState(getSavedRoles)

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const navigate = target => {
    setView('home')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }))
  }
  const discover = () => {
    const result = analyzeCareer(source)
    setAnalysis(result)
    setSelected(result.roles[0])
    setView('results')
    window.scrollTo(0, 0)
  }
  const loadFile = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt')) {
      notify('This local MVP reads .txt files. Paste PDF or DOCX text into the field.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => { setSource(String(reader.result || '')); notify(`${file.name} loaded.`) }
    reader.readAsText(file)
  }
  const saveRole = role => {
    const next = [...new Set([...savedRoles, role.title])]
    localStorage.setItem('rated-n:saved-roles', JSON.stringify(next))
    setSavedRoles(next)
    notify(next.length === savedRoles.length ? 'This path is already saved on this device.' : 'Path saved on this device.')
  }

  const common = { navigate, setView, toast, notify, setModal, savedCount: savedRoles.length }
  let page
  if (view === 'results' && analysis) page = <Results {...common} analysis={analysis} selected={selected} setSelected={setSelected}/>
  else if (view === 'detail' && selected) page = <Detail {...common} role={selected} saveRole={saveRole} isSaved={savedRoles.includes(selected.title)}/>
  else page = <Home {...common} source={source} setSource={setSource} discover={discover} loadFile={loadFile}/>

  return <>{page}<InfoModal type={modal} close={() => setModal(null)}/></>
}

function Header({ navigate, setModal, savedCount }) {
  return <header>
    <button className="wordmark" onClick={() => navigate('top')} aria-label="Rated N home">Rated <i>N</i></button>
    <nav>
      <button onClick={() => navigate('how-it-works')}>How it works</button>
      <button onClick={() => setModal('privacy')}>Privacy</button>
      {savedCount > 0 && <span className="saved-count" aria-label={`${savedCount} saved paths`}>{savedCount} saved</span>}
      <button className="nav-cta" onClick={() => navigate('start')}>Get started</button>
    </nav>
  </header>
}

function InfoModal({ type, close }) {
  if (!type) return null
  const content = type === 'privacy'
    ? { title: 'Your data stays in your browser.', body: 'This prototype analyzes the text you enter on your device. It makes no API request with your career information. Uploaded text is held only in page memory; saved role titles use local browser storage. Closing or refreshing clears the entered résumé text.' }
    : { title: 'How the score is calculated.', body: 'Core capability overlap contributes 80% of the score. Role-specific supporting evidence contributes 20%. No evidence produces a 0% score. This is an evidence-overlap measure, not a hiring probability or guarantee.' }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={close} aria-label="Close">×</button>
      <p className="kicker">Rated N</p><h2 id="modal-title">{content.title}</h2><p>{content.body}</p>
      <button className="primary" onClick={close}>Understood</button>
    </section>
  </div>
}

const Toast = ({ toast }) => toast && <div className="toast" role="status">{toast}</div>

function Home({ source, setSource, discover, loadFile, toast, notify, ...headerProps }) {
  return <main id="top">
    <Header {...headerProps}/>
    <section className="hero"><div className="hero-copy"><p className="kicker">Your career, seen differently</p><h1>Discover what you’re qualified <em>to become.</em></h1><p className="lede">Add your experience. Rated N extracts demonstrated capabilities and maps them to credible career paths.</p></div><div className="hero-art"><img src="/career-map.png" alt="Abstract professional connections"/><div className="proof"><strong>1</strong><span>clearer map of what<br/>you can do next</span></div></div></section>
    <section className="workspace functional" id="start"><div className="profile-panel"><div className="panel-top"><div><p className="eyebrow">Start your discovery</p><h3>What have you actually done?</h3></div><span className="status">Private in this browser</span></div><p>Paste experience from a résumé, LinkedIn profile, project history, or career notes. Your text is analyzed locally in this prototype and is not uploaded.</p><label className="field-label" htmlFor="profile-text">Your experience</label><textarea id="profile-text" value={source} onChange={event => setSource(event.target.value)} placeholder="Example: I managed a team, trained colleagues, coordinated projects, worked with clients, and improved operational processes..."/><div className="intake-actions"><button className="primary" onClick={discover} disabled={source.trim().length < 40}>Analyze my experience <b>→</b></button><button className="text-btn" onClick={() => setSource(exampleText)}>Use an example</button><label className="file-upload">Upload .txt<input type="file" accept="text/plain,.txt" onChange={loadFile}/></label></div>{source.trim() && <p className="input-status">{source.trim().split(/\s+/).length} words ready to analyze</p>}</div>
      <div className="question-panel" id="how-it-works"><p className="eyebrow">How it works</p><h3>Evidence, then opportunity.</h3><ol className="steps"><li><b>01</b><span>Extract capabilities from your words</span></li><li><b>02</b><span>Compare them to role requirements</span></li><li><b>03</b><span>Show your strongest evidence and gaps</span></li></ol><button className="text-btn inverse" onClick={() => headerProps.setModal('privacy')}>What happens to my data? →</button></div>
    </section><Toast toast={toast}/>
  </main>
}

function Results({ analysis, selected, setSelected, setView, toast, notify, setModal, ...headerProps }) {
  const [filter, setFilter] = useState(null)
  const visibleRoles = filter ? analysis.roles.filter(role => role.matched.includes(filter)) : analysis.roles
  const hasEvidence = analysis.hasEvidence
  return <main><Header {...headerProps} setModal={setModal}/>
    <section className={`results-head ${hasEvidence ? '' : 'zero-results'}`}><div><button className="back" onClick={() => setView('home')}>← Edit experience</button><p className="kicker">Career discovery · your local analysis</p><h1>{hasEvidence ? <>These paths fit more<br/>than your <em>past titles.</em></> : <>We need more concrete<br/><em>career evidence.</em></>}</h1>{!hasEvidence && <p className="zero-copy">We found no recognizable capability signals, so we have not recommended or scored any roles. Add responsibilities, accomplishments, tools, or projects.</p>}</div><aside><strong>{analysis.capabilities.length}</strong><span>capabilities found<br/>in your career story</span></aside></section>
    {hasEvidence && <><section className="capability-strip"><span>Filter by capability</span>{analysis.capabilities.map(item => <button className={filter === item.name ? 'active' : ''} aria-pressed={filter === item.name} onClick={() => setFilter(filter === item.name ? null : item.name)} key={item.name}>{item.label}</button>)}</section><section className="results-layout"><div className="role-list"><p className="list-label">{filter ? `${visibleRoles.length} roles using ${capabilityMap[filter].label}` : 'Opportunities ranked by demonstrated overlap'}</p>{visibleRoles.map(role => <button key={role.title} className={'role-card '+(selected?.title === role.title ? 'selected' : '')} onClick={() => { setSelected(role); setView('detail') }}><span className={'match-dot '+(role.category === 'Unexpected' ? 'moss' : role.category === 'Adjacent' ? 'sand' : 'coral')}>{role.score}</span><span className="role-copy"><small>{role.category}</small><strong>{role.title}</strong><em>{role.matched.length} of {role.needs.length} core capability areas demonstrated</em></span><b>→</b></button>)}</div><aside className="signal"><p className="eyebrow">How to read this</p><h2>Scores reflect overlap—not a hiring guarantee.</h2><p>Core capability evidence supplies 80% of the score; role-specific supporting evidence supplies 20%. Open a role to inspect both.</p><button className="text-btn" onClick={() => setModal('scoring')}>See scoring logic →</button></aside></section></>}
    <Toast toast={toast}/>
  </main>
}

function HighlightedEvidence({ evidence, term }) {
  const index = evidence.toLowerCase().indexOf(term.toLowerCase())
  if (index < 0) return evidence
  return <>{evidence.slice(0, index)}<mark>{evidence.slice(index, index + term.length)}</mark>{evidence.slice(index + term.length)}</>
}

function Detail({ role, setView, toast, notify, saveRole, isSaved, setModal, ...headerProps }) {
  const corePercent = Math.round((role.matched.length / role.needs.length) * 100)
  return <main><Header {...headerProps} setModal={setModal}/><section className="detail-hero"><button className="back" onClick={() => setView('results')}>← All opportunities</button><div className="role-heading"><div><p className="kicker">{role.category} opportunity</p><h1>{role.title}</h1><p>{role.matched.length} of {role.needs.length} core capabilities for this path were found in your provided experience.</p></div><div className="big-score"><strong>{role.score}%</strong><span>evidence overlap</span></div></div></section><section className="detail-grid"><article className="evidence"><p className="eyebrow">Your supporting evidence</p><h2>We only use what you gave us.</h2>{role.evidence.length ? role.evidence.map(item => <blockquote className="quote" key={item.name}>“<HighlightedEvidence evidence={item.evidence} term={item.term}/>”<small>Matched capability · {item.label}</small></blockquote>) : <p>No direct evidence was found for this role yet. Add more concrete accomplishments and tools to improve the analysis.</p>}<p className="matched-title">Demonstrated capabilities</p><ul className="matched-list">{role.matched.map(item => <li key={item}>{capabilityMap[item].label}</li>)}</ul></article><aside className="scorecard"><p className="eyebrow">Match detail</p><div className="score-row"><span>Core capabilities</span><b>{role.matched.length}/{role.needs.length}</b><i><i style={{width:corePercent+'%'}}/></i></div><div className="score-row"><span>Total evidence overlap</span><b>{role.score}%</b><i><i style={{width:role.score+'%'}}/></i></div><p className="gap-title">Evidence gaps</p>{role.gaps.length ? role.gaps.map(gap => <div className="gap" key={gap}>{gap}</div>) : <div className="gap complete">No catalogued evidence gaps found</div>}</aside></section><section className="path"><div><p className="eyebrow">A realistic next step</p><h2>Turn your evidence into a transition plan.</h2></div><ol><li><b>01</b><span>Review the highlighted evidence for accuracy</span></li><li><b>02</b><span>{role.gaps.length ? `Build one practical proof point around ${role.gaps[0]}` : 'Validate these capabilities against real job descriptions'}</span></li><li><b>03</b><span>Position your experience for {role.title} opportunities</span></li></ol><button className="primary" onClick={() => saveRole(role)}>{isSaved ? 'Saved on device' : 'Save this path'} <b>→</b></button></section><Toast toast={toast}/></main>
}

createRoot(document.getElementById('root')).render(<App />)
