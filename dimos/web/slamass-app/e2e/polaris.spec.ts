import { test, expect } from "@playwright/test";

test.describe("/polaris", () => {
  test("lander: nav bar and static body, no robot grid", async ({ page }) => {
    await page.goto("/polaris");
    await expect(page).toHaveURL(/\/polaris\/?$/);
    await expect(page).not.toHaveURL(/\/polaris\/operators/);

    await expect(page.locator(".polaris-root")).toBeVisible();
    await expect(page.getByTestId("polaris-lander")).toBeVisible();
    await expect(page.getByTestId("polaris-lander-intro")).toHaveText(
      /The operating system for the physical world\./,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /The operating system for the physical world\./,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("polaris-nav-title")).toBeVisible();
    await expect(page.getByTestId("polaris-robot-slot")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /open operators/i })).toBeVisible();
    await expect(page.getByTestId("polaris-lander-bento")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Specification highlights", level: 2 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Unitree A2", exact: true }),
    ).toHaveAttribute("href", "https://www.unitree.com/A2");
  });
});

test.describe("/polaris/operators", () => {
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
    await expect(robotSlots).toHaveCount(4);
    await expect(robotSlots.first()).toBeVisible();
    const firstRobotImg = robotSlots.first().locator(".polaris-operator-card-img");
    await expect(firstRobotImg).toBeVisible();
    await expect(firstRobotImg).toHaveAttribute(
      "src",
      /65264e97e81744409042d34bf3ba6da6_400x400\.png/,
    );
    const secondCardImg = robotSlots.nth(1).locator(".polaris-operator-card-img");
    await expect(secondCardImg).toHaveAttribute(
      "src",
      /65264e97e81744409042d34bf3ba6da6_400x400\.png/,
    );
    const thirdCardImg = robotSlots.nth(2).locator(".polaris-operator-card-img");
    await expect(thirdCardImg).toBeVisible();
    await expect(thirdCardImg).toHaveAttribute(
      "src",
      /11d0a76afbb74e8fb7f692652b4c33e0_800x800\.png/,
    );
    await expect(robotSlots.nth(2).getByText("Unitree AS2")).toBeVisible();
    const fourthCardImg = robotSlots.nth(3).locator(".polaris-operator-card-img");
    await expect(fourthCardImg).toBeVisible();
    await expect(fourthCardImg).toHaveAttribute(
      "src",
      /874b8a23698a49fda7bd98f01a6fa648_800x800\.png/,
    );
    const a2TitleLink = robotSlots
      .nth(3)
      .getByRole("link", { name: "Unitree A2", exact: true });
    await expect(a2TitleLink).toBeVisible();
    await expect(a2TitleLink).toHaveAttribute("href", "https://www.unitree.com/A2");

    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close sidebar" }),
    ).toBeVisible();
    const dialog = page.getByRole("dialog");
    const operators = dialog.getByTestId("polaris-sidebar-operators");
    await expect(operators).toBeVisible();
    await expect(operators.getByText("Operators")).toBeVisible();
    await expect(operators.locator("img")).toHaveCount(0);

    const abilitiesTile = dialog.getByTestId("polaris-sidebar-abilities");
    await expect(abilitiesTile).toBeVisible();
    await expect(abilitiesTile.getByText("Abilities")).toBeVisible();
    await expect(abilitiesTile.locator("img")).toHaveCount(0);
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

  test("configurator link navigates to general view", async ({ page }) => {
    await page.goto("/polaris/operators");
    const configurator = page
      .getByTestId("polaris-robot-slot")
      .first()
      .getByRole("link", { name: /configurator/i });
    await expect(configurator).toHaveAttribute("href", "/polaris/configurator");
    await configurator.click();
    await expect(page).toHaveURL(/\/polaris\/configurator/);
    await expect(page.getByTestId("polaris-configurator-heading")).toHaveText("Configurator");
    await expect(page.getByTestId("polaris-configurator-back")).toHaveAttribute(
      "href",
      "/polaris/operators",
    );
    await expect(page.getByRole("region", { name: "Robot capture history" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Spatial map" })).toBeVisible();
  });
});
