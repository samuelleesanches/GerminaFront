import { css, html, LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { UserSettings } from "../core/game/UserSettings";
import {
  INFRASTRUCTURE,
  MILITARY,
  POLICIES,
  RESEARCH,
  RESOURCES,
  StrategyAction,
} from "../core/strategy/Definitions";
import type {
  Country,
  StrategySnapshot,
} from "../core/strategy/StrategicWorld";
import { translateText } from "./Utils";

const text = (key: string) => translateText(`strategy.${key}`);
const number = (value: number) => value.toLocaleString();
const tabs = [
  "economy",
  "population",
  "resources",
  "trade",
  "military",
  "technology",
  "infrastructure",
  "diplomacy",
  "climate",
  "stocks",
  "news",
];

export class StrategyPanel extends LitElement {
  @property({ attribute: false }) data?: StrategySnapshot;
  @property({ attribute: false }) mapWidth = 1;
  @property({ attribute: false }) mapHeight = 1;
  @state() private opened = false;
  @state() private tab = "economy";
  @state() private target = "";
  @state() private resource = "food";
  @state() private quantity = 10;
  @state() private mapMode = "political";
  @state() private quality = "medium";
  private send(action: StrategyAction) {
    this.dispatchEvent(
      new CustomEvent("strategy-action", {
        detail: action,
        bubbles: true,
        composed: true,
      }),
    );
  }
  private button(label: string, action: StrategyAction, disabled = false) {
    return html`<button ?disabled=${disabled} @click=${() => this.send(action)}>
      ${text(label)}
    </button>`;
  }
  private label(key: string) {
    return text(key);
  }
  private economy(c: Country) {
    return html`<p>${text("economy_hint")}</p>
      <div class="grid">
        ${POLICIES.map(
          (p) =>
            html`<button
              class=${p === c.policy ? "selected" : ""}
              @click=${() => this.send({ op: "policy", key: p })}
            >
              ${text(p)}
            </button>`,
        )}
      </div>
      <p>
        ${text("income")}: <strong>${c.modifiers.income}%</strong> ·
        ${text("recruitment")}: ${c.modifiers.recruitment}%
      </p>
      <p>
        ${text("stability")}: ${c.stability}/100 · ${text("specialization")}:
        ${text(c.specialization)}
      </p>
      <p>
        ${text("reasons")}:
        ${c.reasons.length
          ? [...new Set(c.reasons)].map((r) => text(`reason_${r}`)).join(", ")
          : text("stable")}
      </p>`;
  }
  private population(c: Country) {
    return html`<p>${text("population")}: ${number(c.population)}</p>
      <p>
        ${text("production")}: ${c.workforce[0]}% · ${text("military")}:
        ${c.workforce[1]}% · ${text("science")}: ${c.workforce[2]}%
      </p>
      <p>${text("workforce_hint")}</p>
      <div class="grid">
        ${["civil", "balanced", "military", "science"].map((key) =>
          this.button(key, { op: "workforce", key }),
        )}
      </div>`;
  }
  private resources(c: Country) {
    return html`<p>${text("resources_hint")}</p>
      <table>
        <thead>
          <tr>
            ${[
              "resource",
              "deposit",
              "stock",
              "production",
              "consumption",
              "price",
            ].map((k) => html`<th>${text(k)}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${RESOURCES.map(
            (r) =>
              html`<tr>
                <td>${text(r)}</td>
                <td>${c.deposits[r] || "·"}</td>
                <td>${number(c.stocks[r])}</td>
                <td>+${c.production[r]}</td>
                <td>${c.consumption[r]}</td>
                <td>${this.data!.market[r].price}</td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }
  private targetSelect() {
    return html`<label
      >${text("partner")}<select
        .value=${this.target}
        @change=${(e: Event) =>
          (this.target = (e.target as HTMLSelectElement).value)}
      >
        <option value="">${text("choose")}</option>
        ${this.data!.countries.filter((c) => c.id !== this.data!.me?.id).map(
          (c) =>
            html`<option value=${c.id}>
              ${c.name} · ${text(c.specialization)}
            </option>`,
        )}
      </select></label
    >`;
  }
  private trade(c: Country) {
    return html`<p>${text("trade_hint")}</p>
      <div class="row">
        <label
          >${text("resource")}<select
            .value=${this.resource}
            @change=${(e: Event) =>
              (this.resource = (e.target as HTMLSelectElement).value)}
          >
            ${RESOURCES.map(
              (r) => html`<option value=${r}>${text(r)}</option>`,
            )}
          </select></label
        ><label
          >${text("quantity")}<input
            type="number"
            min="1"
            max="1000"
            .value=${String(this.quantity)}
            @change=${(e: Event) =>
              (this.quantity = Math.max(
                1,
                Math.min(
                  1000,
                  Number((e.target as HTMLInputElement).value) || 1,
                ),
              ))}
        /></label>
      </div>
      <div class="row">
        ${this.button("buy", {
          op: "buy",
          key: this.resource,
          amount: this.quantity,
        })}${this.button("sell", {
          op: "sell",
          key: this.resource,
          amount: this.quantity,
        })}
      </div>
      ${this.targetSelect()}
      <div class="row">
        ${this.button(
          "offer",
          {
            op: "offer",
            key: this.resource,
            target: this.target,
            amount: this.quantity,
            duration: 20,
          },
          !this.target,
        )}${this.button(
          "embargo",
          { op: "embargo", target: this.target },
          !this.target,
        )}
      </div>
      <label
        >${text("tariff")}<select
          .value=${String(c.tariff)}
          @change=${(e: Event) =>
            this.send({
              op: "tariff",
              amount: Number((e.target as HTMLSelectElement).value),
            })}
        >
          ${[0, 10, 20, 30].map((v) => html`<option value=${v}>${v}%</option>`)}
        </select></label
      >
      <table>
        <tbody>
          ${this.data!.contracts.filter(
            (t) => t.seller === c.id || t.buyer === c.id,
          ).map(
            (t) =>
              html`<tr>
                <td>
                  #${t.id} ${text(t.resource)} · ${t.quantity} × ${t.price}
                </td>
                <td>${text(t.status)} · ${t.remaining}</td>
                <td>
                  ${t.buyer === c.id && !t.accepted
                    ? this.button("accept", { op: "accept", amount: t.id })
                    : ""}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }
  private military(c: Country) {
    return html`<p>${text("military_hint")}</p>
      <p>
        ${text("land")}: ${c.modifiers.land}% · ${text("air")}:
        ${c.modifiers.air}% · ${text("navy")}: ${c.modifiers.sea}%
      </p>
      <table>
        <tbody>
          ${Object.entries(MILITARY).map(
            ([key, spec]) =>
              html`<tr>
                <td>
                  ${text(key)}<small
                    >${text(spec.research)} ${spec.level} ·
                    ${Object.entries(spec.materials)
                      .map(([r, n]) => `${n} ${text(r)}`)
                      .join(", ")}</small
                  >
                </td>
                <td>${c.military[key]}<br />${number(spec.cost)}</td>
                <td>
                  ${this.button(
                    "recruit",
                    { op: "recruit", key },
                    c.research[spec.research] < spec.level ||
                      c.military[key] >= 20,
                  )}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }
  private technology(c: Country) {
    return html`<p>${text("technology_hint")}</p>
      <table>
        <tbody>
          ${RESEARCH.map(
            (key) =>
              html`<tr>
                <td>
                  ${text(key)}<small
                    >${text("level")} ${c.research[key]}/4 ·
                    ${c.progress[key]
                      ? `${c.progress[key]}/${70 + c.research[key] * 50}`
                      : text("idle")}</small
                  >
                </td>
                <td>${number(2500 * (c.research[key] + 1))}</td>
                <td>
                  ${this.button(
                    "research",
                    { op: "research", key },
                    c.progress[key] > 0 || c.research[key] >= 4,
                  )}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }
  private infrastructure(c: Country) {
    return html`<p>${text("infrastructure_hint")}</p>
      <table>
        <tbody>
          ${INFRASTRUCTURE.map(
            (key) =>
              html`<tr>
                <td>
                  ${text(key)}<small
                    >${text("level")} ${c.infrastructure[key]}/8 ·
                    ${text("materials")}: ${3 + c.infrastructure[key]}
                    ${text("steel")} + ${3 + c.infrastructure[key]}
                    ${text("wood")}</small
                  >
                </td>
                <td>
                  ${number(
                    (key === "nuclear" ? 12000 : 2000) *
                      (c.infrastructure[key] + 1),
                  )}
                </td>
                <td>
                  ${this.button(
                    "build",
                    { op: "build", key },
                    c.infrastructure[key] >= 8 ||
                      (key === "nuclear" && c.research.energy < 2),
                  )}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }
  private diplomacy(c: Country) {
    return html`<p>
        ${text("reputation")}: ${c.reputation}/100 · ${text("influence")}:
        ${number(c.influence)}
      </p>
      <p>${text("diplomacy_hint")}</p>
      ${this.targetSelect()}
      <div class="grid">
        ${this.button(
          "war",
          { op: "war", target: this.target },
          !this.target || c.neutral,
        )}${this.button(
          "peace",
          { op: "peace", target: this.target },
          !this.target,
        )}${this.button(
          "aid",
          { op: "aid", target: this.target, amount: 20 },
          !this.target,
        )}${this.button(
          "resolve",
          { op: "resolve", target: this.target },
          !this.target || c.influence < 20,
        )}${this.button(c.neutral ? "end_neutral" : "neutral", {
          op: "neutral",
        })}
      </div>
      ${this.data!.resolutions.map(
        (r) =>
          html`<p>
            #${r.id}: ${text("sanctions")} →
            ${this.data!.countries.find((x) => x.id === r.target)?.name} ·
            ${Object.values(r.votes).filter(Boolean).length} ${text("yes")}<br />${this.button(
              "yes",
              { op: "vote", amount: r.id, key: "yes" },
            )}
            ${this.button("no", { op: "vote", amount: r.id, key: "no" })}
          </p>`,
      )}`;
  }
  private stocks(c: Country) {
    return html`<p>${text("stocks_hint")}</p>
      ${POLICIES.map((p) => {
        const co = this.data!.companies[p];
        const min = Math.min(...co.history) - 1,
          span = Math.max(...co.history) - min;
        const points = co.history
          .map(
            (x, i) =>
              `${(i * 190) / Math.max(1, co.history.length - 1)},${40 - ((x - min) * 35) / span}`,
          )
          .join(" ");
        return html`<div class="company">
          <strong>${text(p)} · ${number(co.price)}</strong
          ><small>${text("shares")}: ${c.portfolio[p]}</small
          ><svg viewBox="0 0 190 45" aria-label=${text(p)}>
            <polyline
              fill="none"
              stroke="#6de6b4"
              stroke-width="2"
              points=${points}
            ></polyline></svg
          >${this.button("invest", { op: "invest", key: p, amount: 1 })}
          ${this.button(
            "divest",
            { op: "divest", key: p, amount: 1 },
            !c.portfolio[p],
          )}
        </div>`;
      })}`;
  }
  private overview() {
    const countries = this.data!.countries;
    return html`<label
        >${text("map_mode")}<select
          .value=${this.mapMode}
          @change=${(e: Event) =>
            (this.mapMode = (e.target as HTMLSelectElement).value)}
        >
          ${[
            "political",
            "resources",
            "climate",
            "economy",
            "population",
            "military",
            "trade",
            "terrain",
            "infrastructure",
          ].map((m) => html`<option value=${m}>${text(m)}</option>`)}
        </select></label
      >
      <p>${text("overview_hint")}</p>
      <svg
        class="overview"
        viewBox="0 0 400 190"
        role="img"
        aria-label=${text("overview")}
      >
        ${countries.map((c) => {
          let value = c.score;
          if (this.mapMode === "population") value = c.population / 100;
          if (this.mapMode === "military") value = c.military * 20;
          if (this.mapMode === "infrastructure" || this.mapMode === "trade")
            value = c.ports * 50;
          if (this.mapMode === "economy") value = c.income;
          if (this.mapMode === "climate")
            value = c.weather === "clear" ? 0 : 200;
          if (this.mapMode === "terrain")
            value =
              [
                "plains",
                "forest",
                "desert",
                "mountain",
                "hill",
                "tundra",
                "coast",
                "river",
                "volcanic",
                "archipelago",
              ].indexOf(c.terrain) * 30;
          if (this.mapMode === "resources")
            value = RESOURCES.indexOf(c.specialization) * 12;
          const hue =
            this.mapMode === "political"
              ? c.id.charCodeAt(0) * 7
              : Math.max(0, 130 - Math.min(130, value / 2));
          return html`<circle
            cx=${(c.x * 390) / this.mapWidth + 5}
            cy=${(c.y * 180) / this.mapHeight + 5}
            r=${c.id === this.data!.me?.id ? 5 : 3}
            fill=${`hsl(${hue} 65% 60%)`}
            ><title>
              ${c.name} · ${text(c.terrain)} · ${text(c.weather)} ·
              ${text(c.specialization)} · ${c.income}% · ${number(c.population)}
            </title></circle
          >`;
        })}
        ${this.mapMode === "trade"
          ? this.data!.contracts.filter((t) => t.accepted).map((t) => {
              const a = countries.find((c) => c.id === t.seller),
                b = countries.find((c) => c.id === t.buyer);
              return a && b
                ? html`<line
                    x1=${(a.x * 390) / this.mapWidth + 5}
                    y1=${(a.y * 180) / this.mapHeight + 5}
                    x2=${(b.x * 390) / this.mapWidth + 5}
                    y2=${(b.y * 180) / this.mapHeight + 5}
                    stroke=${t.status === "blocked" ? "#f07878" : "#6de6b4"}
                    opacity=".6"
                    ><title>${text(t.resource)} ${text(t.status)}</title></line
                  >`
                : "";
            })
          : ""}
      </svg>`;
  }
  private setQuality(value: string) {
    this.quality = value;
    const settings = new UserSettings();
    const base = settings.graphicsOverrides();
    settings.setGraphicsOverrides({
      ...base,
      passEnabled: { fx: value !== "low", fallout: value === "high" },
      smallPlayerGlow: { strength: value === "high" ? 1 : 0 },
      name: { ...base.name, cullThreshold: value === "low" ? 0.6 : 0.25 },
      cosmetics: { ...base.cosmetics, territorySkins: value !== "low" },
    });
  }
  render() {
    if (!this.data) return html``;
    const c = this.data.me;
    let body = html``;
    if (c) {
      if (this.tab === "economy") body = this.economy(c);
      if (this.tab === "population") body = this.population(c);
      if (this.tab === "resources") body = this.resources(c);
      if (this.tab === "trade") body = this.trade(c);
      if (this.tab === "military") body = this.military(c);
      if (this.tab === "technology") body = this.technology(c);
      if (this.tab === "infrastructure") body = this.infrastructure(c);
      if (this.tab === "diplomacy") body = this.diplomacy(c);
      if (this.tab === "stocks") body = this.stocks(c);
      if (this.tab === "climate")
        body = html`<p>
            ${text("weather")}: <strong>${text(c.weather)}</strong> ·
            ${text(c.terrain)}
          </p>
          <p>${text("climate_hint")}</p>
          ${this.overview()}`;
    }
    if (this.tab === "news")
      body = html`${this.data.news.map(
        (n) =>
          html`<p>
            <small>${Math.floor(n.tick / 10)}s</small> ${text(`news_${n.key}`)}
            ·
            ${this.data!.countries.find((c) => c.id === n.country)?.name ??
            n.country ??
            ""}
            ${n.resource ? text(n.resource) : ""}
            ${this.data!.countries.find((c) => c.id === n.target)?.name ?? ""}
          </p>`,
      )}`;
    return html`<button
        class="open"
        @click=${() => (this.opened = !this.opened)}
      >
        ${text("title")}${c ? ` · ${c.stability}%` : ""}
      </button>
      ${this.opened
        ? html`<section>
            <header>
              <strong>${c?.name ?? text("overview")}</strong
              ><button
                @click=${() => (this.opened = false)}
                aria-label=${text("close")}
              >
                ×
              </button>
            </header>
            <nav>
              ${tabs.map(
                (t) =>
                  html`<button
                    class=${this.tab === t ? "selected" : ""}
                    @click=${() => (this.tab = t)}
                  >
                    ${text(t)}
                  </button>`,
              )}
            </nav>
            <main>${body}${!c ? this.overview() : ""}</main>
            <footer>
              <span>${text("quality")}</span
              ><select
                .value=${this.quality}
                @change=${(e: Event) =>
                  this.setQuality((e.target as HTMLSelectElement).value)}
              >
                ${["low", "medium", "high"].map(
                  (q) => html`<option value=${q}>${q.toUpperCase()}</option>`,
                )}</select
              ><span>${text("cycle")}: ${Math.floor(this.data.tick / 20)}</span>
            </footer>
          </section>`
        : ""}`;
  }
  static styles = css`
    :host {
      position: fixed;
      left: 14px;
      top: 95px;
      z-index: 6000;
      color: #e6edf3;
      font: 13px system-ui;
    }
    button,
    select,
    input {
      font: inherit;
      color: inherit;
      background: #1d2c39;
      border: 1px solid #385067;
      border-radius: 7px;
      padding: 7px;
      cursor: pointer;
    }
    button:hover {
      border-color: #6de6b4;
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .selected {
      background: #23634f;
      border-color: #6de6b4;
    }
    .open {
      background: #182c27;
      font-weight: 600;
      box-shadow: 0 3px 12px #0005;
    }
    section {
      margin-top: 8px;
      width: min(540px, calc(100vw - 28px));
      max-height: calc(100dvh - 155px);
      background: #101c27f5;
      border: 1px solid #3b596e;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 35px #0008;
    }
    header,
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      gap: 10px;
    }
    header button {
      padding: 3px 9px;
    }
    nav {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      padding: 0 12px 10px;
      border-bottom: 1px solid #304250;
    }
    nav button {
      padding: 5px;
      font-size: 12px;
    }
    main {
      overflow: auto;
      padding: 4px 12px 15px;
      min-height: 120px;
    }
    p {
      line-height: 1.5;
      color: #c8d6e4;
    }
    label {
      display: flex;
      gap: 6px;
      align-items: center;
      margin: 9px 0;
    }
    select {
      min-width: 120px;
      max-width: 100%;
    }
    input {
      width: 72px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 12px;
    }
    td,
    th {
      padding: 8px 4px;
      border-bottom: 1px solid #304250;
      text-align: left;
    }
    small {
      display: block;
      color: #a2b6c7;
      font-size: 11px;
      margin: 4px 0;
    }
    .company {
      border-bottom: 1px solid #304250;
      padding: 10px 0;
    }
    .company svg {
      width: 100%;
      height: 45px;
    }
    .overview {
      width: 100%;
      background: #1f3547;
      border-radius: 7px;
    }
    footer {
      border-top: 1px solid #304250;
      font-size: 11px;
    }
    @media (max-width: 600px) {
      :host {
        left: 8px;
        top: 80px;
      }
      section {
        width: calc(100vw - 16px);
        max-height: calc(100dvh - 140px);
      }
      .open {
        font-size: 12px;
      }
      td button {
        padding: 4px;
      }
    }
  `;
}
if (!customElements.get("strategy-panel"))
  customElements.define("strategy-panel", StrategyPanel);
