import { css, html, LitElement } from "lit";
import { property } from "lit/decorators.js";
import type { GameConfig } from "../core/Schemas";
import { translateText } from "./Utils";
export const defaultStrategySettings: NonNullable<GameConfig["strategy"]> = {
  enabled: true,
  preset: "normal",
  victory: "balanced",
  durationTicks: 12000,
  resources: 100,
  events: true,
};
export class StrategySettings extends LitElement {
  @property({ attribute: false }) config: NonNullable<GameConfig["strategy"]> =
    { ...defaultStrategySettings };
  private change(patch: Partial<NonNullable<GameConfig["strategy"]>>) {
    this.config = { ...this.config, ...patch };
    this.dispatchEvent(
      new CustomEvent("strategy-config", {
        detail: this.config,
        bubbles: true,
        composed: true,
      }),
    );
  }
  render() {
    const t = (key: string) => translateText(`strategy.${key}`);
    return html`<section>
      <label
        ><input
          type="checkbox"
          .checked=${this.config.enabled}
          @change=${(e: Event) =>
            this.change({ enabled: (e.target as HTMLInputElement).checked })}
        />${t("enable")}</label
      >
      ${this.config.enabled
        ? html`<div>
            <label
              >${t("preset")}<select
                .value=${this.config.preset ?? "normal"}
                @change=${(e: Event) =>
                  this.change({
                    preset: (e.target as HTMLSelectElement).value as "normal",
                  })}
              >
                ${["casual", "normal", "chaotic"].map(
                  (k) => html`<option value=${k}>${t(k)}</option>`,
                )}
              </select></label
            >
            <label
              >${t("victory")}<select
                .value=${this.config.victory ?? "balanced"}
                @change=${(e: Event) =>
                  this.change({
                    victory: (e.target as HTMLSelectElement)
                      .value as "balanced",
                  })}
              >
                ${["territory", "balanced", "diplomacy", "technology"].map(
                  (k) => html`<option value=${k}>${t(k)}</option>`,
                )}
              </select></label
            >
            <label
              >${t("duration")}<select
                .value=${String(this.config.durationTicks ?? 12000)}
                @change=${(e: Event) =>
                  this.change({
                    durationTicks: Number(
                      (e.target as HTMLSelectElement).value,
                    ),
                  })}
              >
                ${[6000, 12000, 18000].map(
                  (k) => html`<option value=${k}>${k / 600} min</option>`,
                )}
              </select></label
            >
            <label
              >${t("resources")}<select
                .value=${String(this.config.resources ?? 100)}
                @change=${(e: Event) =>
                  this.change({
                    resources: Number((e.target as HTMLSelectElement).value),
                  })}
              >
                ${[50, 100, 200].map(
                  (k) => html`<option value=${k}>${k}%</option>`,
                )}
              </select></label
            >
            <label
              ><input
                type="checkbox"
                .checked=${this.config.events !== false}
                @change=${(e: Event) =>
                  this.change({
                    events: (e.target as HTMLInputElement).checked,
                  })}
              />${t("events")}</label
            >
          </div>`
        : ""}
    </section>`;
  }
  static styles = css`
    :host {
      display: block;
      color: inherit;
      font: inherit;
    }
    section {
      margin: 16px 0;
      border: 1px solid #566b7c80;
      padding: 15px;
      border-radius: 10px;
    }
    div {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    label {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    select {
      color: inherit;
      background: #203344;
      padding: 7px;
      border: 1px solid #567083;
      border-radius: 5px;
    }
    input {
      accent-color: #37bd92;
    }
  `;
}
if (!customElements.get("strategy-settings"))
  customElements.define("strategy-settings", StrategySettings);
