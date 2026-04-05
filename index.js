import { chromium } from "playwright";
import { writeFile, readFile } from "fs/promises";

const context = await chromium.launchPersistentContext("./chromium", {
  viewport: { width: 1050, height: 1000 },
  headless: false,
  // slowMo: 3000,
  args: ["--window-position=1200,0"],
});
const page = context.pages()[0] || (await context.newPage());

await page.bringToFront();

let oldIds = [];
let idFiles = {};

try {
  oldIds = JSON.parse(await readFile("./ids.json", "utf8"));
} catch (err) {
  console.log("There was an error loading file. ");
}

page.setDefaultTimeout(200_000);

await page.goto("https://sportybet.com/gh/sport/football/upcoming?time=0");
await page.waitForTimeout(20_000);

let j = 0;
const ids = [];

async function start() {
  /* const browser = await chromium.launch({
    ,
  }); */
  /* 
  const contexts = browser.contexts();

  let page;
  for (const context of contexts) {
    const pages = context.pages();

    for (const thisPage of pages) {
      page = thisPage.url().includes("sportybet.com") ? thisPage : undefined;
    }
  }
 */

  await page.waitForSelector("#importMatch .match-league-wrap", {
    state: "visible",
  });
  await page.waitForTimeout(200);

  if (!(await page.locator("#j_page_header.s-header.s-header-on").count())) {
    console.log("This is inside the Login Function");
    await page.locator(".m-login-bar .m-opt button[name='register']").click();

    await page
      .locator("div")
      .filter({ hasText: /^Login$/ })
      .first()
      .click();
    await page
      .locator("#esDialog0")
      .getByRole("textbox", { name: "Mobile Number" })
      .fill("593861032");

    await page
      .locator("#esDialog0")
      .getByRole("textbox", { name: "Password" })
      .fill('+n"!p,r6WwA3Vik');
    await page
      .locator("#esDialog0")
      .getByRole("button", { name: "Login" })
      .click();
  }

  const leagues = await page.locator("#importMatch .match-league-wrap").all();

  async function bet() {
    const slip = page.locator(".m-betslips .m-stake");

    await slip.locator(".m-plays-wrapper .m-plays .m-money input").fill("0.5");

    //! So the element is not visible Yet //

    const betBtn = slip.locator(
      ".m-btn-wrapper button.af-button.af-button--primary"
    );

    await betBtn.click();
    await page.waitForTimeout(1_000);

    const confirm = slip.locator(
      ".m-comfirm-wrapper .m-btn-wrapper button.af-button.af-button--primary"
    );

    await confirm.click();
    const success = page.locator(
      ".m-dialog-wrapper .m-btn-wrapper.m-ok-wrap button.af-button.af-button--primary"
    );
    await page.waitForTimeout(2_00);

    await success.click();
  }

  async function stake(league) {
    // await page.pause();
    await league.locator(".market-group .market-item:nth-child(2)").click();
    await page.waitForTimeout(2_00);

    const matches = await league
      .locator(".m-table.match-table > .m-table-row")
      .all();

    async function selectedOdd(odds) {
      let notThree = [];
      for (const odd of odds) {
        const oddNum = +(await odd.textContent());
        if (oddNum < 3) {
          notThree.push(odd);
        }
      }

      if (notThree.length === 1) return odds[0];

      let maxEle;

      for (const odd of notThree) {
        const oddNum = +(await odd.textContent());
        const maxNum = +Math.max(
          ...(await Promise.all(
            notThree.map(async (each) => +(await each.textContent()))
          ))
        );

        if (oddNum === maxNum) {
          maxEle = odd;
          break;
        }
      }
      return maxEle;
    }

    let dateText;
    for (const match of matches) {
      // await page.pause();

      if (await match.evaluate((el) => el.classList.contains("date-row"))) {
        dateText = await match.locator(".date").textContent();
        const [month, day] = [
          +/(?<=\/)\d+/.exec(dateText)[0],
          +/\d+/.exec(dateText)[0],
        ];

        const hour = (Math.abs(month - 12) + 1) * day;
        const toDate = new Date();

        const nextWeek =
          (Math.abs(toDate.getMonth() + 1 - 12) + 1) * (toDate.getDate() + 7);

        if (nextWeek < hour) {
          break;
        } else {
          continue;
        }
      }

      const idsFile = /[^]+ /
        .exec(dateText)[0]
        .trim()
        .replace("/", "-");
      // await page.pause();
      const id = /\d+/.exec(
        await match.locator(".time div.game-id").textContent()
      )[0];
      let history = [];
      
      try {
        history = JSON.parse(
          await readFile(`./history/${idsFile}.json`, "utf8")
        );
      } catch {}
      
      if (history?.includes(id)) {
        console.log("Yes I contain so I will continue.");
        continue;
      }
      idFiles[idsFile] = idFiles[idsFile] ? [...idFiles?.[idsFile], id] : [id];

      ids.push(id);

      const odds = await match
        .locator(".m-market.market .m-outcome .m-outcome-odds")
        .all();

      if (
        await match.locator(".m-market.market > .m-outcome--disabled").count()
      )
        continue;
      (await selectedOdd(odds)).click();

      j++;

      if (j === 9) {
        await bet();
        for (const item of Object.entries(idFiles)) {
          const [id, arr] = item;

          await writeFile(`./history/${id}.json`, JSON.stringify(arr));
        }
        j = 0;
        // await page.pause();
      }

      await page.waitForTimeout(500);
    }
  }

  for (const league of leagues) {
    const viewAll = league.locator(".view-all");

    if ((await viewAll.count()) > 0) {
      await viewAll.click();

      await stake(page.locator("#importMatch .match-league-wrap"));
      await page.getByText("Football").nth(5).click();
    } else {
      await stake(league);
    }
    await page.waitForTimeout(1_00);
    if (leagues.indexOf(league) + 1 === leagues.length) {
      await page.locator(".pageNum.icon-next").click();
      start();
      return;
    }
  }
  await browser.close();
}
await start();
