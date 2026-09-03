import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
export const maxDuration=60;
const MODEL=process.env.OPENAI_DEAL_MODEL||"gpt-5.6-luna";

export async function POST(req:NextRequest){
 const key=process.env.OPENAI_API_KEY;
 if(!key)return NextResponse.json({error:"Add OPENAI_API_KEY in Vercel to activate live search."},{status:503});
 let body:any; try{body=await req.json()}catch{return NextResponse.json({error:"Invalid request."},{status:400})}
 const query=typeof body?.query==="string"?body.query.trim():"";
 if(!query)return NextResponse.json({error:"Enter what kind of deal you want."},{status:400});

 const prompt=`You are UnderAsk, a deal-finding engine.
Search the live public web for REAL second-hand or marketplace listings matching:
"${query}"

Find public market evidence/comparables to estimate resale value.

RULES:
- Return at most 4 strong deals.
- Every result MUST have a real public listing URL.
- Do not invent listings, prices, or evidence.
- Exclude uncertain results.
- expected_sale_price = realistic achievable resale, never the highest asking price.
- quick_sale_price = conservative fast-sale value.
- Do NOT calculate ROI, net profit, price gap or deal score.
- Keep text concise.
- Numeric money values in EUR.
- confidence and speed_to_sell are 0-100 integers.

Return ONLY valid JSON:
{"deals":[{"title":"string","url":"https://...","source":"site","ask_price":0,"expected_sale_price":0,"quick_sale_price":0,"estimated_fees":0,"estimated_shipping":0,"estimated_repair_cost":0,"confidence":0,"speed_to_sell":0,"reasoning":"one sentence","risks":["short risk"],"evidence":["short market observation"]}]}`;

 try{
   const response=await openai(key,prompt);
   const text=outputText(response);
   const parsed=JSON.parse(text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim());
   const deals=(Array.isArray(parsed?.deals)?parsed.deals:[]).slice(0,4).map(score).filter(Boolean).filter((d:any)=>d.net_profit>0&&d.roi_percent>0).sort((a:any,b:any)=>b.deal_score-a.deal_score);
   return NextResponse.json({deals,meta:{model:MODEL,result_count:deals.length,scoring_version:"v1.1"}});
 }catch(e:any){
   if(String(e?.message).includes("RATE_LIMIT"))return NextResponse.json({error:"Search capacity is busy right now. Please retry in about 30–60 seconds."},{status:429});
   return NextResponse.json({error:"UnderAsk could not complete this search. Try a slightly narrower request."},{status:500});
 }
}

async function openai(key:string,prompt:string){
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify({model:MODEL,tools:[{type:"web_search"}],input:prompt,max_output_tokens:2200}),cache:"no-store"});
  if(r.ok)return r.json();
  if(r.status===429){
   if(attempt===2)throw new Error("RATE_LIMIT");
   const ra=Number(r.headers.get("retry-after")); const ms=Number.isFinite(ra)?ra*1000:Math.min(12000,1500*Math.pow(2,attempt));
   await new Promise(x=>setTimeout(x,ms)); continue;
  }
  throw new Error(`OPENAI_${r.status}`);
 }
 throw new Error("RATE_LIMIT");
}

function outputText(r:any){
 if(typeof r?.output_text==="string"&&r.output_text.trim())return r.output_text.trim();
 const a:string[]=[]; for(const item of r?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&typeof c?.text==="string")a.push(c.text);
 return a.join("\n").trim();
}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function s(v:any){return typeof v==="string"?v.trim():""}
function arr(v:any){return Array.isArray(v)?v.map(s).filter(Boolean):[]}
function clamp(x:number,a:number,b:number){return Math.min(b,Math.max(a,x))}
function r2(x:number){return Math.round(x*100)/100}
function score(d:any){
 const title=s(d.title),url=s(d.url),source=s(d.source)||"Web",ask=n(d.ask_price),expected=n(d.expected_sale_price),quick=n(d.quick_sale_price);
 const fees=Math.max(0,n(d.estimated_fees)),shipping=Math.max(0,n(d.estimated_shipping)),repair=Math.max(0,n(d.estimated_repair_cost)),confidence=clamp(n(d.confidence),0,100),speed=clamp(n(d.speed_to_sell),0,100);
 if(!title||!/^https?:\/\//i.test(url)||ask<=0||expected<=0||quick<=0)return null;
 const investment=ask+fees+shipping+repair,profit=expected-investment,roi=investment>0?profit/investment*100:0,gap=expected>0?(expected-ask)/expected*100:0;
 const total=100*(.38*clamp(roi/60,0,1)+.22*clamp(gap/45,0,1)+.25*(confidence/100)+.15*(speed/100));
 return {title,url,source,ask_price:r2(ask),expected_sale_price:r2(expected),quick_sale_price:r2(quick),estimated_fees:r2(fees),estimated_shipping:r2(shipping),estimated_repair_cost:r2(repair),net_profit:r2(profit),roi_percent:r2(roi),confidence:Math.round(confidence),speed_to_sell:Math.round(speed),price_gap_percent:r2(gap),deal_score:r2(clamp(total,0,100)),reasoning:s(d.reasoning),risks:arr(d.risks).slice(0,3),evidence:arr(d.evidence).slice(0,3)};
}
