/**
 * Team layer. If SLACK_WEBHOOK_URL is set the nudge really lands in Slack;
 * otherwise it is stored and rendered in the in-app #kindred channel so the
 * demo runs with no workspace attached.
 */
export async function postToSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { delivered: false, channel: 'app', reason: 'no SLACK_WEBHOOK_URL — rendered in the in-app #kindred channel' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(6000)
    });
    return { delivered: res.ok, channel: 'slack', reason: res.ok ? 'posted' : `slack ${res.status}` };
  } catch (err) {
    return { delivered: false, channel: 'app', reason: String(err.message || err) };
  }
}
