import { test, expect } from "@playwright/test";

test.describe("/polaris", () => {
  test("lander: nav bar and static body, no robot grid", async ({ page }) => {
    await page.goto("/polaris");
    await expect(page).toHaveURL(/\/polaris\/?$/);
    await expect(page).not.toHaveURL(/\/polaris\/operators/);

    await expect(page.locator(".polaris-root")).toBeVisible();
    await expect(page.getByTestId("polaris-lander")).toBeVisible();
    const landerHeading = /The intelligent OS\s+for the physical world\./;
    await expect(page.getByTestId("polaris-lander-intro")).toHaveText(landerHeading);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: landerHeading,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("polaris-nav-title")).toBeVisible();
    await expect(page.getByTestId("polaris-robot-slot")).toHaveCount(0);
    const explore = page.getByRole("link", { name: /explore polaris/i });
    await expect(explore).toBeVisible();
    await expect(explore).toHaveAttribute("href", "/polaris/navigator");
    await expect(page.getByTestId("polaris-lander-preview")).toBeVisible();
  });
});

test.describe("/polaris/operators", () => {
  test("/operators alias loads operators page", async ({ page }) => {
    await page.goto("/operators");
    await expect(page.getByTestId("polaris-operators-heading")).toHaveText(
      "Operators",
    );
  });

  test("desktop: slate shell, hamburger opens sidebar on demand", async ({
    page,
  }) => {
    await page.goto("/polaris/operators");

    const root = page.locator(".polaris-root");
    await expect(root).toBeVisible();
    await expect(root).toHaveCSS("background-color", "rgb(248, 250, 252)");

    const header = page.locator(".polaris-header");
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS("border-bottom-width", "0px");

    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByText("Polaris"),
    ).toBeVisible();

    const navTitle = page.getByTestId("polaris-nav-title");
    await expect(navTitle).toBeVisible();
    await expect(navTitle).toHaveCSS("font-size", "22px");
    await expect(navTitle).toHaveCSS("font-weight", "300");
    await expect(navTitle).toHaveCSS("color", "rgb(71, 85, 105)");

    const menu = page.getByTestId("polaris-menu-button");
    await expect(menu).toBeVisible();
    const menuIcon = menu.locator(".polaris-menu-icon");
    const firstBar = menu.locator(".polaris-menu-bar").first();
    await expect(menuIcon).toHaveCSS("width", "20px");
    await expect(firstBar).toHaveCSS("height", "1px");
    await expect(firstBar).toHaveCSS("background-color", "rgb(51, 65, 85)");
    await expect(
      page.getByRole("button", { name: "Close sidebar" }),
    ).toBeHidden();

    const operatorsHeading = page.getByTestId("polaris-operators-heading");
    await expect(operatorsHeading).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operators", level: 1 })).toBeVisible();
    await expect(operatorsHeading).toHaveCSS("font-size", "22px");
    await expect(operatorsHeading).toHaveCSS("font-weight", "300");
    await expect(operatorsHeading).toHaveCSS("color", "rgb(71, 85, 105)");

    const robotSlots = page.getByTestId("polaris-robot-slot");
    await expect(robotSlots).toHaveCount(2);
    await expect(robotSlots.first()).toBeVisible();
    const firstRobotImg = robotSlots.first().locator(".polaris-operator-card-img--static");
    await expect(firstRobotImg).toBeVisible();
    await expect(firstRobotImg).toHaveAttribute(
      "src",
      /65264e97e81744409042d34bf3ba6da6_400x400\.png/,
    );
    await expect(robotSlots.first().getByText("Unitree Go2 X")).toBeVisible();
    const secondCardImg = robotSlots.nth(1).locator(".polaris-operator-card-img--static");
    await expect(secondCardImg).toHaveAttribute(
      "src",
      /9896d21bdef4443d821a324931d8af0c_800x800\.png/,
    );
    await expect(robotSlots.nth(1).getByText("Unitree Go2 EDU")).toBeVisible();

    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close sidebar" }),
    ).toBeVisible();
    const dialog = page.getByRole("dialog");
    const navigatorLink = dialog.getByTestId("polaris-sidebar-navigator");
    await expect(navigatorLink).toBeVisible();
    await expect(navigatorLink).toHaveAttribute("href", "/polaris/navigator");
    await expect(navigatorLink.getByText("Navigator")).toBeVisible();
    await expect(navigatorLink.locator("img")).toHaveCount(0);

    const operators = dialog.getByTestId("polaris-sidebar-operators");
    await expect(operators).toBeVisible();
    await expect(operators).toHaveAttribute("href", "/polaris/operators");
    await expect(operators.getByText("Operators")).toBeVisible();
    const operatorsArt = operators.locator("img.polaris-sidebar-nav-operators-img");
    await expect(operatorsArt).toHaveCount(1);
    await expect(operatorsArt).toHaveAttribute(
      "src",
      /shop\.unitree\.com\/cdn\/shop\/files\/23\.png/,
    );
  });

  test("mobile: hamburger opens slide-over sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/polaris/operators");

    const menu = page.getByTestId("polaris-menu-button");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(16);
    expect(box!.height).toBeGreaterThan(16);

    const bars = menu.locator(".polaris-menu-bar");
    await expect(bars).toHaveCount(3);
    await expect(bars.first()).toBeVisible();
    await expect(menu.locator(".polaris-menu-icon")).toHaveCSS("width", "20px");
    await expect(bars.first()).toHaveCSS("height", "1px");

    await expect(page.getByTestId("polaris-nav-title")).toHaveCSS("font-size", "18px");
    const operatorsHeading = page.getByTestId("polaris-operators-heading");
    await expect(operatorsHeading).toHaveCSS("font-size", "18px");
    await expect(operatorsHeading).toHaveCSS("font-weight", "300");
    await expect(operatorsHeading).toHaveCSS("color", "rgb(71, 85, 105)");

    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close sidebar" }),
    ).toBeVisible();
    const operators = page.getByRole("dialog").getByTestId("polaris-sidebar-operators");
    await expect(operators).toBeVisible();
    await expect(operators.getByText("Operators")).toBeVisible();
  });

  test("add operator navigates to create page", async ({ page }) => {
    await page.goto("/polaris/operators");
    await page.getByTestId("polaris-add-operator-button").click();
    await expect(page).toHaveURL(/\/polaris\/create$/);
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Choose Operator");
    await expect(page.getByTestId("polaris-create-back")).toHaveAttribute(
      "href",
      "/polaris/operators",
    );
  });

  test("navigator link navigates to general view", async ({ page }) => {
    await page.goto("/polaris/operators");
    const navigatorLink = page
      .getByTestId("polaris-robot-slot")
      .first()
      .getByRole("link", { name: /navigator/i });
    await expect(navigatorLink).toHaveAttribute("href", "/polaris/navigator");
    await navigatorLink.click();
    await expect(page).toHaveURL(/\/polaris\/navigator/);
    await expect(page.getByTestId("polaris-navigator-main")).toBeVisible();
  });

  test("/navigator alias loads Navigator with Polaris chrome", async ({ page }) => {
    await page.goto("/navigator");
    await expect(page.getByTestId("polaris-nav-title")).toHaveText("Polaris");
    await expect(page.getByTestId("polaris-navigator-main")).toBeVisible();
  });

  test("direct /polaris/navigator loads Polaris navigator shell", async ({ page }) => {
    await page.goto("/polaris/navigator");
    await expect(page).toHaveURL(/\/polaris\/navigator/);
    await expect(page.getByTestId("polaris-nav-title")).toHaveText("Polaris");
    await expect(page.getByTestId("polaris-navigator-main")).toBeVisible();
  });

  test("/configurator alias matches navigator entry", async ({ page }) => {
    await page.goto("/configurator");
    await expect(page.getByTestId("polaris-navigator-main")).toBeVisible();
  });
});

test.describe("/polaris/navigator", () => {
  test("desktop: three columns share the same row height", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/polaris/navigator");

    const main = page.getByTestId("polaris-navigator-main");
    await expect(main).toBeVisible();

    const columns = main.locator(":scope > *");
    await expect(columns).toHaveCount(3);

    const heights = await columns.evaluateAll((elements) =>
      elements.map((el) => Math.round(el.getBoundingClientRect().height)),
    );

    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    expect(
      maxH - minH,
      `column heights [${heights.join(", ")}]px should match (grid row stretch)`,
    ).toBeLessThanOrEqual(3);

    const sidebar = page.locator('[aria-label="Navigator options"]');
    const inner = sidebar.locator(".polaris-navigator-operations-inner");
    await expect(inner).toBeVisible();
    const sidebarH = await sidebar.evaluate((el) => el.getBoundingClientRect().height);
    const innerH = await inner.evaluate((el) => el.getBoundingClientRect().height);
    expect(
      Math.round(sidebarH) - Math.round(innerH),
      "operators + agent stack should fill the left column height",
    ).toBeLessThanOrEqual(2);
  });

  test("header Create Operator links to create flow", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/polaris/navigator");

    const create = page.getByTestId("polaris-header-create-operator");
    await expect(create).toBeVisible();
    await expect(create).toHaveAttribute("href", "/polaris/create");
    await expect(create).toHaveText("Create Operator");

    await create.click();
    await expect(page).toHaveURL(/\/polaris\/create$/);
    await expect(page.getByTestId("polaris-create-heading")).toBeVisible();
  });
});

test.describe("/polaris/create", () => {
  test("direct URL loads choose operator page", async ({ page }) => {
    await page.goto("/polaris/create");
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Choose Operator");
  });

  test("wizard: clicking Go2 opens Define Skills and advances progress", async ({ page }) => {
    await page.goto("/polaris/create");
    await page.getByTestId("polaris-create-pick-go2").click();
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Define Skills");
    await expect(page.getByTestId("polaris-create-define-skills")).toBeVisible();
    const bar = page.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    await page.getByTestId("polaris-create-advance-mount").click();
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Mount Manipulators");
    await expect(bar).toHaveAttribute("aria-valuenow", "3");
    await expect(page.getByTestId("polaris-create-wizard-deploy")).not.toBeVisible();
    await page.getByTestId("polaris-create-advance-use-case").click();
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Use case");
    await expect(page.getByTestId("polaris-create-use-case")).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuenow", "4");
    await expect(page.getByTestId("polaris-create-wizard-deploy")).toBeVisible();
  });

  test("wizard back returns to previous step with Operators link", async ({ page }) => {
    await page.goto("/polaris/create");
    await page.getByTestId("polaris-create-pick-go2").click();
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Define Skills");
    await page.getByTestId("polaris-create-back").click();
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Choose Operator");
    await expect(page.getByTestId("polaris-create-back")).toHaveAttribute(
      "href",
      "/polaris/operators",
    );
  });

  test("/create alias loads choose operator page", async ({ page }) => {
    await page.goto("/create");
    await expect(page.getByTestId("polaris-create-heading")).toHaveText("Choose Operator");
  });

  test("desktop: G1 pick image bottom aligns with card bottom", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/polaris/create");

    const g1 = page.getByTestId("polaris-create-pick-g1");
    await expect(g1).toBeVisible();
    const img = g1.locator(".polaris-create-pick-card-img");
    await expect(img).toBeVisible();
    await img.evaluate((el: HTMLImageElement) => {
      if (el.complete && el.naturalWidth > 0) {
        return;
      }
      return new Promise<void>((resolve, reject) => {
        el.addEventListener("load", () => resolve(), { once: true });
        el.addEventListener("error", () => reject(new Error("G1 preview image failed to load")), {
          once: true,
        });
      });
    });

    const media = g1.locator(".polaris-create-pick-card-media");
    const cardBox = await g1.boundingBox();
    const mediaBox = await media.boundingBox();
    const imgBox = await img.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(mediaBox).not.toBeNull();
    expect(imgBox).not.toBeNull();

    const imgBottom = imgBox!.y + imgBox!.height;
    const mediaBottom = mediaBox!.y + mediaBox!.height;
    expect(
      Math.abs(imgBottom - mediaBottom),
      "image bottom should match media frame bottom (object-position / flex-end)",
    ).toBeLessThan(2);

    const paddingBottom = await g1.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingBottom),
    );
    const cardBottom = cardBox!.y + cardBox!.height;
    const expectedMediaBottom = cardBottom - paddingBottom;
    expect(
      Math.abs(mediaBottom - expectedMediaBottom),
      "portrait media block should sit on the card’s bottom padding edge",
    ).toBeLessThan(4);
  });
});
