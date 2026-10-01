import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategyPanel } from "../../src/client/StrategyPanel";
import { StrategySettings } from "../../src/client/StrategySettings";
import { SpawnExecution } from "../../src/core/execution/SpawnExecution";
import { PlayerInfo, PlayerType } from "../../src/core/game/Game";
import { UserSettings } from "../../src/core/game/UserSettings";
import { StrategicWorld } from "../../src/core/strategy/StrategicWorld";
import { setup } from "../util/Setup";
vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
}));

afterEach(() => {
  document
    .querySelectorAll("strategy-settings,strategy-panel")
    .forEach((e) => e.remove());
  localStorage.clear();
});
describe("Strategic interface", () => {
  it("updates the match configuration from the visible controls", async () => {
    const settings = new StrategySettings();
    document.body.append(settings);
    await settings.updateComplete;
    const changed = vi.fn();
    settings.addEventListener("strategy-config", changed);
    const select = settings.shadowRoot!.querySelector("select")!;
    select.value = "chaotic";
    select.dispatchEvent(new Event("change"));
    await settings.updateComplete;
    expect(settings.config.preset).toBe("chaotic");
    expect(changed).toHaveBeenCalledOnce();
    const checkbox = settings.shadowRoot!.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    await settings.updateComplete;
    expect(settings.config.enabled).toBe(false);
    expect(settings.shadowRoot!.querySelector("select")).toBeNull();
  });
  it("renders the real simulation and sends decisions; quality updates renderer settings", async () => {
    const game = await setup("ocean_and_land", {
      strategy: { enabled: true },
      spawnImmunityDuration: 0,
    });
    const player = new PlayerInfo(
      "Alpha888",
      PlayerType.Human,
      "Alpha888",
      "Alpha888",
    );
    game.addPlayer(player);
    game.addExecution(new SpawnExecution("Test8888", player, game.ref(1, 10)));
    game.executeNextTick();
    game.executeNextTick();
    const world = new StrategicWorld(game, "Test8888");
    world.ensure(game.player("Alpha888"));
    world.step(20);
    const panel = new StrategyPanel();
    panel.data = world.snapshot("Alpha888");
    document.body.append(panel);
    await panel.updateComplete;
    panel.shadowRoot!.querySelector<HTMLButtonElement>(".open")!.click();
    await panel.updateComplete;
    expect(panel.shadowRoot!.querySelectorAll("nav button")).toHaveLength(11);
    const actions = vi.fn();
    panel.addEventListener("strategy-action", actions);
    [...panel.shadowRoot!.querySelectorAll<HTMLButtonElement>("main button")]
      .find((b) => b.textContent?.trim() === "strategy.industry")!
      .click();
    expect((actions.mock.calls[0][0] as CustomEvent).detail).toEqual({
      op: "policy",
      key: "industry",
    });
    const quality =
      panel.shadowRoot!.querySelector<HTMLSelectElement>("footer select")!;
    quality.value = "low";
    quality.dispatchEvent(new Event("change"));
    expect(new UserSettings().graphicsOverrides().passEnabled?.fx).toBe(false);
    expect(
      new UserSettings().graphicsOverrides().cosmetics?.territorySkins,
    ).toBe(false);
  });
});
