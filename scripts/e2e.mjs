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
  await page.getByRole("button", { name: "Enter the feed" }).click();
  await page.getByRole("button", { name: "For You" }).waitFor();
});
await shot("02-for-you");

await step("like toggle", async () => {
  const like = page.locator(".actions").first().getByRole("button", { name: "Like" });
  await like.click();
  await page.waitForTimeout(200);
  const on = await like.locator(".icon").evaluate((el) => el.classList.contains("on"));
  if (!on) throw new Error("heart did not turn on");
  await like.click();
  await page.waitForTimeout(200);
  const off = await like.locator(".icon").evaluate((el) => el.classList.contains("on"));
  if (off) throw new Error("heart did not turn off");
});

await step("comment", async () => {
  await page.locator(".actions").first().getByRole("button", { name: "Comments" }).click();
  await page.getByPlaceholder("Say something degen...").fill("nice bag");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("nice bag").waitFor();
  await shot("03-comments");
  await page.locator(".sheet").click({ position: { x: 20, y: 20 } });
  await page.locator(".sheet").waitFor({ state: "hidden" });
});

await step("follow from reel", async () => {
  const follow = page.locator(".reel").first().locator(".follow");
  if (!(await follow.count())) return;
  const text = (await follow.innerText()).trim();
  if (text === "Follow") {
    await follow.click();
    await page.waitForTimeout(150);
    if ((await follow.innerText()).trim() !== "Following") throw new Error("did not follow");
  } else {
    await follow.click();
    await page.waitForTimeout(150);
    if ((await follow.innerText()).trim() !== "Follow") throw new Error("did not unfollow");
    await follow.click();
    await page.waitForTimeout(150);
    if ((await follow.innerText()).trim() !== "Following") throw new Error("did not restore follow");
  }
});

await step("scroll to next reel", async () => {
  const firstToken = await page.locator(".pnl-hero .token").first().innerText();
  await page.locator(".feed").evaluate((el) => {
    el.scrollBy({ top: el.clientHeight, behavior: "instant" });
  });
  await page.waitForTimeout(400);
  const secondToken = await page.locator(".pnl-hero .token").nth(1).innerText();
  if (secondToken === firstToken) {
    // still ok if same token appears twice, but hero should have moved
    const scroll = await page.locator(".feed").evaluate((el) => el.scrollTop);
    if (scroll < 100) throw new Error("feed did not scroll");
  }
});
await shot("04-second-reel");

await step("token filter", async () => {
  await page.locator(".feed").evaluate((el) => {
    el.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(200);
  const token = (await page.locator(".caption button").first().innerText()).replace("$", "");
  await page.locator(".caption button").first().click();
  await page.locator(".top-lane").getByRole("button", { name: `$${token} ×` }).waitFor();
});
await shot("05-token-filter");

await step("following + stories", async () => {
  await page.locator(".top-lane").getByRole("button", { name: "Following" }).click();
  await page.locator(".stories").waitFor();
  await shot("06-following");
  await page.locator(".story-dot").first().click();
  await page.locator(".viewer").waitFor();
  await shot("07-story");
  await page.getByRole("button", { name: "Next story" }).click();
  await page.getByRole("button", { name: "Close stories" }).click();
  await page.locator(".viewer").waitFor({ state: "hidden" });
});

await step("explore search", async () => {
  await page.getByRole("button", { name: "Explore" }).click();
  await page.getByPlaceholder("Search $WIF or @handle").fill("WIF");
  await page.locator(".token-card", { hasText: "$WIF" }).waitFor();
  await shot("08-explore");
  await page.locator(".token-card", { hasText: "$WIF" }).click();
  await page.locator(".top-lane").getByRole("button", { name: "$WIF ×" }).waitFor();
});

await step("create reel + story", async () => {
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "WIN" }).click();
  await page.getByLabel("Token").fill("FROG");
  await page.getByLabel("PnL %").fill("150");
  await page.getByLabel("Caption").fill("First frog of the day. Taking half off at resistance.");
  await page.getByLabel("Also drop this as a 24h story").check();
  await shot("09-create");
  await page.getByRole("button", { name: "Post reel + story" }).click();
  await page.getByText("$FROG").first().waitFor();
  const hero = await page.locator(".pnl-hero").first().innerText();
  if (!hero.includes("+150%") || !hero.includes("$FROG")) {
    throw new Error(`new reel not on top: ${hero}`);
  }
});
await shot("10-new-reel");

await step("own story appears", async () => {
  await page.locator(".top-lane").getByRole("button", { name: "Following" }).click();
  await page.locator(".story-dot", { hasText: "You" }).waitFor();
});

await step("profile edit + grid", async () => {
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByText("@moonbag").waitFor();
  await page.getByText("$FROG").waitFor();
  await shot("11-profile");
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.locator("textarea").fill("Frog season.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByText("Frog season.").waitFor();
  await page.locator(".grid-card").first().click();
  await page.locator(".reel").first().waitFor();
});

await step("inbox + share", async () => {
  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.getByText(/Your \$FROG win is live/).waitFor();
  await shot("12-inbox");
  await page.getByRole("button", { name: "Home" }).click();
  const share = page.locator(".actions").first().getByRole("button", { name: "Share" });
  const before = await share.innerText();
  await share.click();
  await page.getByText("Copied to clipboard").waitFor();
  await page.waitForTimeout(150);
  const after = await share.innerText();
  if (after === before) throw new Error("share count did not increment");
});
await shot("13-share-toast");

await step("mobile viewport", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Home" }).click();
  await page.locator(".reel").first().waitFor();
  await shot("14-mobile");
  await page.getByRole("button", { name: "Explore" }).click();
  await page.getByRole("heading", { name: "Explore" }).waitFor();
  await shot("15-mobile-explore");
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
