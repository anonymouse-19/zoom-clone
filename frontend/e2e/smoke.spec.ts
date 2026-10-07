/**
 * Behaviors proven in this file (end to end, in real browsers, against running servers):
 * 1. Signed out, the dashboard sends you to the login page; logging in with the demo
 *    account shows its seeded meetings.
 * 2. Two people in one meeting see each other's video: the signed-in host starts a
 *    meeting, a guest (no account) joins with the invite link, and video frames flow
 *    both ways (WebRTC).
 * 3. When the host ends the meeting, the guest lands on the summary page.
 */

import { expect, test, type Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

/** How many <video> elements on the page are actually receiving frames. */
async function playingVideoCount(page: Page): Promise<number> {
  return page.evaluate(
    () => [...document.querySelectorAll("video")].filter((video) => video.videoWidth > 0).length,
  );
}

/** Log in with the seeded demo account, from the login page's demo button. */
async function logInAsDemoUser(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in as the demo user" }).click();
  await expect(page.getByRole("button", { name: "New meeting", exact: true })).toBeVisible();
}

test("signed out you get the login page; the demo account sees its meetings", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await logInAsDemoUser(page);
  await expect(page.getByText("Daily Standup").first()).toBeVisible();
});

test("two people in a meeting see each other, and ending it shows the summary", async ({
  browser,
  page: host,
  request,
}) => {
  // The host logs in and starts a new meeting from the dashboard.
  await logInAsDemoUser(host);
  await host.getByRole("button", { name: "New meeting", exact: true }).click();
  await expect(host.getByRole("button", { name: "Change view" })).toBeVisible();
  const meetingCode = host.url().match(/room\/(\d+)/)?.[1] ?? "";
  // Meeting details (with the invite link) are private to the host, so ask as the host.
  const hostToken = await host.evaluate(() => window.localStorage.getItem("zoom-clone.auth-token"));
  const meeting = await (
    await request.get(`${API_URL}/api/meetings/${meetingCode}`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    })
  ).json();

  // A guest, in a separate browser context (like another computer), joins by invite link.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(meeting.invite_link);
  await guest.getByLabel("Your name").fill("Guest Tester");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest.getByRole("button", { name: "Change view" })).toBeVisible();

  // Both see two tiles, with video frames arriving (their own camera + the other person).
  await expect(host.getByRole("group", { name: "Guest Tester" })).toBeVisible();
  await expect.poll(() => playingVideoCount(host), { timeout: 20_000 }).toBe(2);
  await expect.poll(() => playingVideoCount(guest), { timeout: 20_000 }).toBe(2);

  // The host ends the meeting for everyone; the guest is taken to the summary.
  await host.getByRole("button", { name: "End or leave the meeting" }).click();
  await host.getByRole("menuitem", { name: "End meeting for all" }).click();
  await expect(guest).toHaveURL(/\/ended\?reason=ended/);
  await expect(guest.getByRole("heading", { name: "The meeting has ended" })).toBeVisible();

  await guestContext.close();
});
