import { expect, test } from '@playwright/test';

const profile = { id: '11111111-1111-4111-8111-111111111111', status: 'ready', dna_summary: 'A delivery leader who improves systems and develops people.', competencies_count: 4, skills_count: 3, transferable_count: 5, roles_count: 8, region: 'Toronto, Canada', experience_text: 'I led a frontline team, trained new hires, managed budgets, and improved complex delivery workflows.' };
const baseRole = { id: '22222222-2222-4222-8222-222222222222', profile_id: profile.id, title: 'Program Manager', role_type: 'Direct', match_score: 78, note: 'A strong evidence-backed next step.', why_qualify: 'Your delivery and leadership evidence matches this role.', strengths: ['Program delivery', 'Team leadership'], gaps: ['PMP certification'], transition_difficulty: 'Low–Moderate', evidence_quote: 'I led a frontline team and improved complex delivery workflows.', evidence_source: 'your career story', path_steps: ['Validate the role requirements.', 'Build one relevant proof point.', 'Speak with two practitioners.'], score_breakdown: { experience: 88, skills: 72, competencies: 81, education: 0, certifications: 0, preferences: 65 }, region: 'Toronto, Canada', market_evidence: 'Current public postings in Toronto ask for cross-functional delivery and stakeholder leadership.', market_sources: [{ title: 'Program Manager', employer: 'Example Co', location: 'Toronto, Canada', url: 'https://www.linkedin.com/jobs/view/123' }], success_signal: 'A concise delivery case study.', saved: false, status: 'Not started', resume_markdown: null, cover_letter_markdown: null, linkedin_summary_markdown: null };
const roles = Array.from({ length: 8 }, (_, index) => ({ ...baseRole, id: `${index + 2}2222222-2222-4222-8222-222222222222`.slice(0, 36), title: index ? `Opportunity ${index + 1}` : baseRole.title, role_type: ['Direct', 'Adjacent', 'Unexpected', 'Stretch'][index % 4], match_score: 78 - index }));

async function mockAuthenticatedApi(page) {
  let currentRole = { ...baseRole };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let payload;
    let status = 200;
    if (path === '/api/config') payload = { google_auth_enabled: true, email_delivery_enabled: true };
    else if (path === '/api/auth/me') payload = { user: { id: 'user-1', email: 'person@example.com' } };
    else if (path === '/api/profiles/analyze') { payload = { profile: { ...profile, status: 'analyzing', roles_count: 0 } }; status = 202; }
    else if (path === `/api/profiles/${profile.id}`) payload = { profile };
    else if (path === `/api/profiles/${profile.id}/roles`) payload = { roles };
    else if (path === `/api/roles/${baseRole.id}/materials`) {
      currentRole = { ...currentRole, resume_markdown: '# Résumé\n\nVerified experience only.', cover_letter_markdown: '# Cover letter\n\nEvidence-backed application.', linkedin_summary_markdown: '# About\n\nDelivery leader.' };
      payload = { role: currentRole };
    } else if (path === `/api/roles/${baseRole.id}` && request.method() === 'PATCH') {
      currentRole = { ...currentRole, ...request.postDataJSON() }; payload = { role: currentRole };
    } else if (path === `/api/roles/${baseRole.id}`) payload = { role: currentRole };
    else if (path === '/api/dashboard') payload = { profiles: [profile], roles: [{ ...currentRole, saved: true }] };
    else if (path === '/api/auth/logout') payload = { ok: true };
    else { status = 404; payload = { error: { message: `Unmocked ${request.method()} ${path}` } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
}

test('complete discovery, role, save, materials, and dashboard flow', async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Discover what you’re qualified/i })).toBeVisible();
  await page.getByRole('button', { name: 'What happens to my data?' }).click();
  await expect(page.getByRole('heading', { name: 'Your career story stays in your account.' })).toBeVisible();
  await page.getByRole('button', { name: 'Understood' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await expect(page.locator('#profile-text')).not.toHaveValue('');
  await page.locator('#region').fill('Toronto, Canada');
  await page.getByRole('button', { name: /Find my paths/ }).click();
  await expect(page).toHaveURL(`/results/${profile.id}`);
  await expect(page.getByText('8', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Edit experience/ }).click();
  await expect(page.locator('#profile-text')).not.toHaveValue('');
  await expect(page.locator('#region')).toHaveValue('Toronto, Canada');
  await page.getByRole('button', { name: /Find my paths/ }).click();
  await page.getByRole('button', { name: /Program Manager/ }).click();
  await expect(page).toHaveURL(`/role/${profile.id}/${baseRole.id}`);
  await expect(page.getByText('Current public postings in Toronto')).toBeVisible();
  await page.locator('#role-status').selectOption('Interviewing');
  await expect(page.getByText('Status updated to “Interviewing”.')).toBeVisible();
  await page.getByRole('button', { name: /Save this path/ }).click();
  await expect(page.getByRole('button', { name: 'Saved to your plan' })).toBeDisabled();
  await page.getByRole('button', { name: /Generate materials/ }).click();
  await expect(page.getByRole('tab', { name: 'Cover letter' })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: /career stories, tracked/i })).toBeVisible();
  await expect(page.getByText('Program Manager').last()).toBeVisible();
});

test('results page waits through analyzing then shows live roles', async ({ page }) => {
  let profileReads = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let payload;
    let status = 200;
    if (path === '/api/config') payload = { google_auth_enabled: true, email_delivery_enabled: true };
    else if (path === '/api/auth/me') payload = { user: { id: 'user-1', email: 'person@example.com' } };
    else if (path === '/api/profiles/analyze') {
      payload = { profile: { ...profile, status: 'analyzing', roles_count: 0 } };
      status = 202;
    } else if (path === `/api/profiles/${profile.id}`) {
      profileReads += 1;
      payload = { profile: profileReads < 2 ? { ...profile, status: 'analyzing', roles_count: 0 } : profile };
    } else if (path === `/api/profiles/${profile.id}/roles`) payload = { roles };
    else { status = 404; payload = { error: { message: `Unmocked ${request.method()} ${path}` } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: /Find my paths/ }).click();
  await expect(page).toHaveURL(`/results/${profile.id}`);
  await expect(page.getByRole('heading', { name: /Reading everything you’ve done/i })).toBeVisible();
  await expect(page.getByText('8', { exact: true }).first()).toBeVisible();
});

test('upload, validation, and mobile navigation remain usable', async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.setViewportSize({ width: 400, height: 850 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.getByRole('button', { name: 'Upload .txt' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'career.txt', mimeType: 'text/plain', buffer: Buffer.from('I led operations, trained new hires, managed budgets, and improved a complex reporting workflow.') });
  await expect(page.locator('#profile-text')).toHaveValue(/managed budgets/);
  await page.locator('#profile-text').fill('Too short');
  await page.getByRole('button', { name: /Discover roles/ }).click();
  await expect(page.getByRole('alert')).toContainText('Add a little more detail');
});
