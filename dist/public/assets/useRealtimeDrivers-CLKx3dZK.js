import{ad as p,ae as v,r as l,af as o,V as a}from"./index-Cp041vsl.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=p("Globe",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=p("KeyRound",[["path",{d:"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",key:"1s6t7t"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}]]);function d(){const{user:s}=v(),r=l.useRef(null);l.useEffect(()=>{var u;if(!s)return;const i=(u=s.user_metadata)==null?void 0:u.role;if(i!=="admin"&&i!=="dispatcher")return;const h=o.channel("realtime-drivers").on("postgres_changes",{event:"*",schema:"public",table:"drivers"},e=>{if(console.log("[Realtime] Driver change:",e.eventType,e.new),a.invalidateQueries({queryKey:["/api/supabase-drivers"]}),a.invalidateQueries({queryKey:["/api/drivers"]}),e.eventType==="UPDATE"&&e.new){const c=e.new;a.setQueryData(["/api/supabase-drivers"],n=>n&&n.map(t=>t.id===c.id?{...t,...c}:t))}}).subscribe(e=>{console.log("[Realtime] Drivers subscription status:",e)});return r.current=h,()=>{r.current&&(o.removeChannel(r.current),r.current=null)}},[s])}export{f as G,m as K,d as u};
