import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCareer } from './careerEngine.js'

test('zero evidence produces zero scores', () => {
  const result = analyzeCareer('zorbles quuxes flarn repeatedly without meaningful work vocabulary')
  assert.equal(result.capabilities.length, 0)
  assert.ok(result.roles.every(role => role.score === 0))
})

test('trained does not produce a technology capability', () => {
  const result = analyzeCareer('Trained and coached a large frontline team through organizational change.')
  assert.equal(result.capabilities.some(item => item.name === 'technology'), false)
  assert.equal(result.capabilities.some(item => item.name === 'training'), true)
})

test('Python produces a technology capability', () => {
  const result = analyzeCareer('Built Python scripts to automate reporting and analyze operational data.')
  assert.equal(result.capabilities.some(item => item.name === 'technology'), true)
})

test('managed budgets satisfies Program Manager budget ownership', () => {
  const result = analyzeCareer('Managed budgets and led programs, coordinated operations, and communicated delivery plans.')
  const role = result.roles.find(item => item.title === 'Program Manager')
  assert.equal(role.gaps.includes('budget ownership'), false)
})

test('evidence is split into granular clauses', () => {
  const result = analyzeCareer('Managed a team, trained new hires, built Python scripts, and improved a workflow.')
  const evidence = result.capabilities.map(item => item.evidence)
  assert.ok(new Set(evidence).size > 1)
  assert.ok(evidence.every(item => item.length < 60))
})
