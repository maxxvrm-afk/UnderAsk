"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getValidOwnTheWallSession } from "@/lib/ownTheWallAuth";
import {
  deletePortfolioDeal,
  fetchPortfolioDeals,
  updatePortfolioDeal,
  type UnderAskPortfolioDeal,
  type PortfolioStatus,
} from "@/lib/underAskPortfolio";

function euro(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function pct(value: number | null | undefined) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function date(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function formNumber(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function statusLabel(status: PortfolioStatus) {
  if (status === "sold") return "SOLD";
  if (status === "listed") return "LISTED";
  return "BOUGHT";
}

export default function PortfolioPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [deals, setDeals] = useState<UnderAskPortfolioDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeDeal, setActiveDeal] = useState<UnderAskPortfolioDeal | null>(null);
  const [status, setStatus] = useState<PortfolioStatus>("bought");
  const [listedPrice, setListedPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [fuelCost, setFuelCost] = useState("");
  const [advertisingCost, setAdvertisingCost] = useState("");
  const [platformFees, setPlatformFees] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [shareToFeed, setShareToFeed] = useState(false);
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const session = await getValidOwnTheWallSession();
        if (!session) {
          router.replace("/login?next=/portfolio");
          return;
        }
        const rows = await fetchPortfolioDeals(session.access_token);
        if (!active) return;
        setAccessToken(session.access_token);
        setDeals(rows);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load your portfolio.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [router]);

  const summary = useMemo(() => {
    const sold = deals.filter((deal) => deal.status === "sold");
    const open = deals.filter((deal) => deal.status !== "sold");
    const realizedProfit = sold.reduce((sum, deal) => sum + (deal.actualProfit || 0), 0);
    const openCapital = open.reduce((sum, deal) => sum + deal.totalInvested, 0);
    const averageRoi = sold.length ? sold.reduce((sum, deal) => sum + (deal.actualRoi || 0), 0) / sold.length : 0;
    return { sold: sold.length, open: open.length, realizedProfit, openCapital, averageRoi };
  }, [deals]);

  function edit(deal: UnderAskPortfolioDeal) {
    setError("");
    setMessage("");
    setActiveDeal(deal);
    setStatus(deal.status);
    setListedPrice(deal.listedPrice === null ? "" : String(deal.listedPrice));
    setSalePrice(deal.salePrice === null ? "" : String(deal.salePrice));
    setFuelCost(deal.fuelCost ? String(deal.fuelCost) : "");
    setAdvertisingCost(deal.advertisingCost ? String(deal.advertisingCost) : "");
    setPlatformFees(deal.platformFees ? String(deal.platformFees) : "");
    setShippingCost(deal.shippingCost ? String(deal.shippingCost) : "");
    setRepairCost(deal.repairCost ? String(deal.repairCost) : "");
    setOtherCosts(deal.otherCosts ? String(deal.otherCosts) : "");
    setShareToFeed(deal.shareToFeed);
    setShareNote(deal.shareNote || "");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!activeDeal || !accessToken || saving) return;

    const listed = listedPrice === "" ? null : formNumber(listedPrice);
    const sold = salePrice === "" ? null : formNumber(salePrice);
    const fuel = formNumber(fuelCost);
    const ads = formNumber(advertisingCost);
    const fees = formNumber(platformFees);
    const shipping = formNumber(shippingCost);
    const repair = formNumber(repairCost);
    const other = formNumber(otherCosts);
    const costs = [fuel, ads, fees, shipping, repair, other];

    if ((listed !== null && (!Number.isFinite(listed) || listed < 0)) || costs.some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Enter valid non-negative prices and costs.");
      return;
    }
    if (status === "sold" && (sold === null || !Number.isFinite(sold) || sold <= 0)) {
      setError("Enter the actual sale price before marking this flip as sold.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const next = await updatePortfolioDeal(accessToken, activeDeal.id, {
        status,
        listedPrice: listed,
        salePrice: status === "sold" ? sold : activeDeal.salePrice,
        fuelCost: fuel,
        advertisingCost: ads,
        platformFees: fees,
        shippingCost: shipping,
        repairCost: repair,
        otherCosts: other,
        listedAt: status === "listed" && !activeDeal.listedAt ? new Date().toISOString() : activeDeal.listedAt,
        soldAt: status === "sold" && !activeDeal.soldAt ? new Date().toISOString() : activeDeal.soldAt,
        shareToFeed: status === "sold" ? shareToFeed : false,
        shareNote: status === "sold" && shareToFeed ? shareNote : null,
      });
      setDeals((current) => current.map((deal) => deal.id === next.id ? next : deal));
      setActiveDeal(null);
      setMessage(status === "sold" ? "Flip closed. Actual profit and ROI are now locked into your portfolio calculation." : "Portfolio deal updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this deal.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(deal: UnderAskPortfolioDeal) {
    if (!accessToken || saving) return;
    if (!window.confirm(`Delete “${deal.title}” from your portfolio?`)) return;
    setSaving(true);
    setError("");
    try {
      await deletePortfolioDeal(accessToken, deal.id);
      setDeals((current) => current.filter((item) => item.id !== deal.id));
      setMessage("Deal removed from Portfolio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this deal.");
    } finally {
      setSaving(false);
    }
  }

  const draftCosts = [fuelCost, advertisingCost, platformFees, shippingCost, repairCost, otherCosts]
    .reduce((sum, value) => {
      const parsed = formNumber(value);
      return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
    }, 0);
  const draftInvested = (activeDeal?.purchasePrice || 0) + draftCosts;
  const draftProfit = status === "sold" && Number(salePrice) > 0 ? Number(salePrice) - draftInvested : null;
  const draftRoi = draftProfit !== null && draftInvested > 0 ? (draftProfit / draftInvested) * 100 : null;

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="/">UnderAsk</a>
        <div className="navLinks">
          <a href="/search">Search</a>
          <a href="/feed">Wins</a>
          <a href="/scoreboard">Scoreboard</a>
          <a href="/saved">Saved</a>
        </div>
      </nav>

      <section className="searchHero" style={{ maxWidth: 1120 }}>
        <div className="eyebrow">PROFIT TRACKER</div>
        <h1>Your resale portfolio.</h1>
        <p className="lede small">Track every euro from purchase to sale. UnderAsk keeps its original prediction next to your real result.</p>

        <div className="metrics" style={{ marginTop: 26 }}>
          <div className="metric"><span>REALIZED PROFIT</span><strong className="accent">{euro(summary.realizedProfit)}</strong></div>
          <div className="metric"><span>OPEN CAPITAL</span><strong>{euro(summary.openCapital)}</strong></div>
          <div className="metric"><span>SOLD FLIPS</span><strong>{summary.sold}</strong></div>
          <div className="metric"><span>OPEN DEALS</span><strong>{summary.open}</strong></div>
          <div className="metric"><span>AVG ACTUAL ROI</span><strong className="accent">{pct(summary.averageRoi)}</strong></div>
        </div>

        {error && <p className="error" style={{ marginTop: 15 }}>{error}</p>}
        {message && <p className="lede small" style={{ marginTop: 15 }}>{message}</p>}
        {loading && <p className="lede small" style={{ marginTop: 24 }}>Loading portfolio...</p>}

        {!loading && deals.length === 0 && (
          <div className="subscriptionGateCard" style={{ marginTop: 30 }}>
            <strong>Your portfolio is empty.</strong>
            <p>Find a deal in UnderAsk and press “Bought this” on the search result. Your predicted and actual performance will be connected automatically.</p>
            <a className="buttonPrimary" href="/search">Find a deal</a>
          </div>
        )}

        {!loading && deals.length > 0 && (
          <div style={{ display: "grid", gap: 13, marginTop: 30, textAlign: "left" }}>
            {deals.map((deal) => {
              const accuracy = deal.status === "sold" && deal.predictedSalePrice && deal.salePrice
                ? Math.max(0, 100 - Math.abs(deal.salePrice - deal.predictedSalePrice) / deal.predictedSalePrice * 100)
                : null;
              return (
                <article className="dealCard" key={deal.id} style={{ margin: 0 }}>
                  <div className="dealTop">
                    <div>
                      <span className="source">{statusLabel(deal.status)} · {deal.source} · BOUGHT {date(deal.boughtAt)}</span>
                      <h2>{deal.title}</h2>
                    </div>
                    <span className="planBadge">{deal.shareToFeed ? "SHARED WIN" : "PRIVATE"}</span>
                  </div>

                  <div className="metrics">
                    <div className="metric"><span>PURCHASE</span><strong>{euro(deal.purchasePrice)}</strong></div>
                    <div className="metric"><span>TOTAL INVESTED</span><strong>{euro(deal.totalInvested)}</strong></div>
                    <div className="metric"><span>PREDICTED SALE</span><strong>{euro(deal.predictedSalePrice)}</strong></div>
                    <div className="metric"><span>ACTUAL SALE</span><strong>{deal.salePrice === null ? "—" : euro(deal.salePrice)}</strong></div>
                    <div className="metric"><span>ACTUAL PROFIT</span><strong className="accent">{deal.actualProfit === null ? "—" : euro(deal.actualProfit)}</strong></div>
                    <div className="metric"><span>ACTUAL ROI</span><strong className="accent">{deal.actualRoi === null ? "—" : pct(deal.actualRoi)}</strong></div>
                    <div className="metric"><span>UNDERASK PREDICTION</span><strong>{deal.predictedRoi === null ? "—" : pct(deal.predictedRoi)}</strong></div>
                    <div className="metric"><span>SALE ACCURACY</span><strong>{accuracy === null ? "—" : pct(accuracy)}</strong></div>
                  </div>

                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
                    {deal.fuelCost > 0 && <span className="planBadge">Fuel {euro(deal.fuelCost)}</span>}
                    {deal.advertisingCost > 0 && <span className="planBadge">Ads {euro(deal.advertisingCost)}</span>}
                    {deal.repairCost > 0 && <span className="planBadge">Repair {euro(deal.repairCost)}</span>}
                    {deal.platformFees > 0 && <span className="planBadge">Fees {euro(deal.platformFees)}</span>}
                    {deal.shippingCost > 0 && <span className="planBadge">Shipping {euro(deal.shippingCost)}</span>}
                    {deal.otherCosts > 0 && <span className="planBadge">Other {euro(deal.otherCosts)}</span>}
                  </div>

                  {deal.shareToFeed && deal.shareNote && <p className="reasoning">“{deal.shareNote}”</p>}

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 17 }}>
                    <button className="buttonPrimary" type="button" onClick={() => edit(deal)}>Update deal</button>
                    {deal.sourceUrl && <a className="openLink" href={deal.sourceUrl} target="_blank" rel="noreferrer">Original listing →</a>}
                    <button className="buttonGhost" type="button" disabled={saving} onClick={() => remove(deal)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {activeDeal && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.78)", display: "grid", placeItems: "center", padding: 18, overflowY: "auto" }}>
          <form onSubmit={save} style={{ width: "min(780px,100%)", padding: 22, borderRadius: 18, border: "1px solid rgba(255,255,255,.14)", background: "#0d0d0d" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
              <div><div className="eyebrow">UPDATE FLIP</div><h2 style={{ margin: "7px 0 5px" }}>{activeDeal.title}</h2></div>
              <button className="buttonGhost" type="button" disabled={saving} onClick={() => setActiveDeal(null)}>Close</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9, marginTop: 18 }}>
              {(["bought","listed","sold"] as PortfolioStatus[]).map((value) => (
                <button key={value} type="button" className={status === value ? "buttonPrimary" : "buttonGhost"} onClick={() => setStatus(value)}>{statusLabel(value)}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 17 }}>
              <label className="filterField"><span>ACTUAL PURCHASE</span><div className="numberInputWrap"><b>€</b><input value={activeDeal.purchasePrice} disabled /></div><small>Original actual purchase price.</small></label>
              <label className="filterField"><span>LISTED PRICE</span><div className="numberInputWrap"><b>€</b><input type="number" min="0" step="0.01" value={listedPrice} onChange={(e) => setListedPrice(e.target.value)} /></div><small>What you ask when listed.</small></label>
              {status === "sold" && <label className="filterField"><span>ACTUAL SALE PRICE</span><div className="numberInputWrap"><b>€</b><input type="number" min="0.01" step="0.01" required value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></div><small>What the buyer actually paid.</small></label>}
              {[
                ["Fuel / travel", fuelCost, setFuelCost],
                ["Advertising", advertisingCost, setAdvertisingCost],
                ["Repair / parts", repairCost, setRepairCost],
                ["Platform / payment fees", platformFees, setPlatformFees],
                ["Shipping", shippingCost, setShippingCost],
                ["Other costs", otherCosts, setOtherCosts],
              ].map(([label, value, setter]) => {
                const set = setter as (value: string) => void;
                return <label className="filterField" key={String(label)}><span>{String(label).toUpperCase()}</span><div className="numberInputWrap"><b>€</b><input type="number" min="0" step="0.01" value={String(value)} onChange={(e) => set(e.target.value)} /></div></label>;
              })}
            </div>

            <div className="metrics" style={{ marginTop: 17 }}>
              <div className="metric"><span>TOTAL INVESTED</span><strong>{euro(draftInvested)}</strong></div>
              <div className="metric"><span>ACTUAL PROFIT</span><strong className="accent">{draftProfit === null ? "—" : euro(draftProfit)}</strong></div>
              <div className="metric"><span>ACTUAL ROI</span><strong className="accent">{draftRoi === null ? "—" : pct(draftRoi)}</strong></div>
            </div>

            {status === "sold" && (
              <div style={{ marginTop: 18, padding: 15, borderRadius: 14, border: "1px solid rgba(255,255,255,.11)", background: "rgba(255,255,255,.025)" }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={shareToFeed} onChange={(e) => setShareToFeed(e.target.checked)} />
                  <span><strong style={{ display: "block" }}>Share this win to the Main Wins Feed</strong><small style={{ display: "block", opacity: .62, marginTop: 4 }}>Off by default. Other UnderAsk customers will see the product, purchase/sale, profit and ROI — never your email.</small></span>
                </label>
                {shareToFeed && <textarea maxLength={280} value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Optional win caption — what made this flip work?" style={{ width: "100%", minHeight: 80, marginTop: 12, resize: "vertical" }} />}
              </div>
            )}

            {error && <p className="error" style={{ marginTop: 13 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 18 }}>
              <button className="buttonGhost" type="button" disabled={saving} onClick={() => setActiveDeal(null)}>Cancel</button>
              <button className="buttonPrimary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save deal"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
