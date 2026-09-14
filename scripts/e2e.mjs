import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.PUMPTOK_URL ?? "http://127.0.0.1:5173";
const OUT = "/tmp/pumptok-e2e";
mkdirSync(OUT, { recursive: true });

const slow = process.env.PUMPTOK_DEMO === "1" ? 220 : 0;

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  slowMo: slow,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  permissions: ["clipboard-read", "clipboard-write"],
  recordVideo: { dir: OUT, size: { width: 1280, height: 860 } },
});
const page = await context.newPage();
const failures = [];

async function shot(name) {
  if (slow) await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL ${name}: ${error.message}`);
    await shot(`fail-${name.replace(/\s+/g, "-")}`);
  }
}

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-onboarding");

await step("onboarding", async () => {
  await page.getByLabel("Handle").fill("moonbag");
  await page.getByLabel("Display name").fill("Moonbag");
  await page.getByRole("button", { name: "Avatar color 312" }).click();
  await page.getByRole("button", { name: "Open your blotter" }).click();
  await page.locator(".top-lane").getByRole("button", { name: "Live" }).waitFor();
  await page.getByText("LIVE CALL").first().waitFor();
});
await shot("02-live-call");

await step("ride and fade", async () => {
  const ride = page.locator(".reel").first().getByRole("button", { name: /Ride/ });
  await ride.click();
  await page.waitForTimeout(200);
  if (!(await ride.evaluate((el) => el.classList.contains("on")))) throw new Error("ride did not lock in");
  await page.locator(".reel").first().getByRole("button", { name: /Fade/ }).click();
  await page.waitForTimeout(200);
  const fade = page.locator(".reel").first().getByRole("button", { name: /Fade/ });
  if (!(await fade.evaluate((el) => el.classList.contains("on")))) throw new Error("fade did not lock in");
});
await shot("03-faded-call");

await step("trader blotter card", async () => {
  await page.locator(".reel").first().getByRole("button", { name: "@chartwitch" }).click();
  await page.locator(".id-card").waitFor();
  await page.getByRole("heading", { name: "@chartwitch" }).waitFor();
  await page.getByText("BLOTTER", { exact: true }).waitFor();
  await page.getByText("Best print").waitFor();
  await page.getByText("hit rate").waitFor();
  await shot("03b-trader-card");
  await page.getByRole("button", { name: "Copy card" }).click();
  await page.getByText("Copied to clipboard").waitFor();
  await page.getByRole("button", { name: "Home" }).click();
  await page.locator(".reel").first().waitFor();
});

await step("comment", async () => {
  await page.locator(".actions").first().getByRole("button", { name: "Comments" }).click();
  await page.getByPlaceholder("Say something degen...").fill("riding this");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("riding this").waitFor();
  await shot("04-comments");
  await page.locator(".sheet").click({ position: { x: 20, y: 20 } });
  await page.locator(".sheet").waitFor({ state: "hidden" });
});

await step("tape and like", async () => {
  await page.locator(".top-lane").getByRole("button", { name: "Tape" }).click();
  await page.getByText("$PEPE").first().waitFor();
  const like = page.locator(".actions").first().getByRole("button", { name: "Like" });
  await like.click();
  await page.waitForTimeout(200);
  const on = await like.locator(".icon").evaluate((el) => el.classList.contains("on"));
  if (!on) throw new Error("heart did not turn on");
});
await shot("05-tape");

await step("token filter", async () => {
  await page.locator(".receipt-token").first().click();
  await page.locator(".top-lane").getByRole("button", { name: /\$/ }).waitFor();
});

await step("watch stories", async () => {
  await page.locator(".top-lane").getByRole("button", { name: "Watch" }).click();
  await page.locator(".stories").waitFor();
  await shot("06-watch");
  await page.locator(".story-dot").first().click();
  await page.locator(".viewer").waitFor();
  await shot("07-story");
  await page.getByRole("button", { name: "Next story" }).click();
  await page.getByRole("button", { name: "Close stories" }).click();
  await page.locator(".viewer").waitFor({ state: "hidden" });
});

await step("graveyard", async () => {
  await page.locator(".top-lane").getByRole("button", { name: "R.I.P." }).click();
  await page.locator(".reel").first().waitFor();
  const stamp = await page.locator(".stamp").first().innerText();
  if (!/RUG|CALL MISS/i.test(stamp)) throw new Error(`graveyard stamp was ${stamp}`);
});
await shot("08-graveyard");

await step("explore arena", async () => {
  await page.getByRole("button", { name: "Explore" }).click();
  await page.getByRole("heading", { name: "The pit" }).waitFor();
  await page.getByPlaceholder("Search $WIF or @handle").fill("WIF");
  await page.locator(".call-card, .token-card", { hasText: "$WIF" }).first().waitFor();
  await shot("09-explore");
});

await step("open a call", async () => {
  await page.getByRole("button", { name: "Create" }).click();
  await page.locator(".kinds").getByRole("button", { name: "CALL", exact: true }).click();
  await page.getByLabel("Token").fill("FROG");
  await page.getByLabel("Target %").fill("40");
  await page.getByLabel("What happened").fill("Opening a 40 print. Ride it or fade it.");
  await shot("10-create-call");
  await page.getByRole("button", { name: "Open the call" }).click();
  await page.getByText("$FROG").first().waitFor();
  await page.getByText("LIVE CALL").first().waitFor();
});
await shot("11-your-live-call");

await step("profile rank", async () => {
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByText("@moonbag").waitFor();
  await page.locator(".id-card").waitFor();
  await page.getByText("Shrimp").waitFor();
  await page.getByText("hit rate").waitFor();
  await page.getByRole("button", { name: "Edit card" }).waitFor();
  await shot("12-profile");
});

await step("inbox + share", async () => {
  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.getByText(/Your \$FROG call is live/).waitFor();
  await shot("13-inbox");
  await page.getByRole("button", { name: "Home" }).click();
  const share = page.locator(".actions").first().getByRole("button", { name: "Share" });
  const before = await share.innerText();
  await share.click();
  await page.getByText("Copied to clipboard").waitFor();
  await page.waitForTimeout(150);
  const after = await share.innerText();
  if (after === before) throw new Error("share count did not increment");
});

await step("mobile viewport", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Home" }).click();
  await page.locator(".reel").first().waitFor();
  await shot("14-mobile-live");
});

const video = await page.video()?.path();
await context.close();
await browser.close();

console.log(`VIDEO ${video ?? "none"}`);
if (failures.length) {
  console.error("FAILURES\n" + failures.join("\n"));
  process.exit(1);
}
console.log("ALL PASSED");
