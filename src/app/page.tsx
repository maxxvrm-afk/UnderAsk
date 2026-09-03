const plans=[
{name:"Scout",price:"€39",desc:"1 marketplace · 5 scanners · 15-min alerts"},
{name:"Pro",price:"€89",desc:"25 scanners · fast alerts · full AI evidence",featured:true},
{name:"Multi Pro",price:"€149",desc:"3 marketplaces · 75 scanners · arbitrage"},
{name:"Business",price:"€249",desc:"All sources · 250 scanners · 3 users"}
];
export default function Pricing(){
 return <main className="shell"><nav className="nav"><a className="brand" href="/">UnderAsk</a><div className="navLinks"><a href="/search">Search</a><a href="/pricing">Pricing</a></div></nav>
 <section className="searchHero"><div className="eyebrow">PRICING</div><h1>Choose your edge.</h1></section>
 <section className="pricingGrid">{plans.map(p=><article className={"priceCard "+(p.featured?"featured":"")} key={p.name}><div className="source">{p.name}</div><div className="price">{p.price}<span>/mo</span></div><p>{p.desc}</p><a className={p.featured?"buttonPrimary":"buttonGhost"} href="/search">Start searching</a></article>)}</section></main>
}
