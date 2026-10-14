export function DoctorStyles() {
  return <style>{`
    .airi-doctor-view{max-width:1240px;margin:0 auto;padding:28px 32px 40px;color:var(--ink);min-width:0;font-size:14px;line-height:1.55}
    .airi-doctor-view *{box-sizing:border-box}.airi-doctor-view h1{font:500 28px/1.2 var(--font-display);margin:0;letter-spacing:-.02em}
    .airi-doctor-view h2{font:500 20px/1.3 var(--font-display);margin:20px 0 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .airi-doctor-view h3{font:600 23px/1.3 var(--font-display);margin:2px 0}.airi-doctor-view p{margin:4px 0}
    .airi-doctor-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:20px}
    .airi-doctor-meta{color:var(--muted);font-size:13px}.airi-doctor-note{color:var(--ink-2);padding:10px 14px;background:var(--surface-2);border-radius:10px;margin:14px 0 20px!important;max-width:90ch}
    .airi-doctor-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;min-width:0}
    .airi-doctor-view .airi-doctor-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;border:1px solid var(--line-2);border-radius:10px;min-height:42px;padding:8px 13px;font-size:13px;line-height:1.4;color:var(--ink);background:var(--surface);text-decoration:none;cursor:pointer;flex-shrink:0}
    .airi-doctor-view .airi-doctor-button:hover:enabled{background:var(--hover)}.airi-doctor-view .airi-doctor-button.primary{background:var(--btn);color:var(--btn-ink);border-color:var(--btn)}
    .airi-doctor-view button:disabled{opacity:.5;cursor:not-allowed}.airi-doctor-view :is(a,button,textarea):focus-visible{outline:2px solid var(--focus);outline-offset:3px}
    .airi-doctor-next{display:flex;align-items:center;gap:20px;padding:20px}.airi-doctor-next>div:nth-child(2){flex:1;min-width:0}
    .airi-doctor-hour{font:500 29px var(--font-display);font-variant-numeric:tabular-nums;min-width:96px}.airi-doctor-hour time{color:var(--ink)}.airi-doctor-hour small{display:block;font:400 12px/1.5 var(--font-text);color:var(--muted)}
    .airi-doctor-columns{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:16px}
    .airi-doctor-row{display:grid;grid-template-columns:50px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}.airi-doctor-row:last-child{border-bottom:0}.airi-doctor-row time{color:var(--muted);font-variant-numeric:tabular-nums}.airi-doctor-row a{color:var(--ink);font-weight:500;text-decoration:none}.airi-doctor-row a:hover{text-decoration:underline}.airi-doctor-row small{display:block;color:var(--muted);font-size:12px}
    .airi-doctor-chip{display:inline-flex;align-items:center;font-size:12px;padding:3px 8px;border-radius:99px;background:var(--surface-2);color:var(--ink-2)}
    .airi-doctor-chip.warning{background:var(--yellow-soft);color:var(--yellow-ink)}.airi-doctor-chip.ok{background:var(--green-soft);color:var(--green-ink)}.airi-doctor-chip.missing{background:var(--red-soft);color:var(--red-ink)}.airi-doctor-chip.blue{background:var(--blue-soft);color:var(--blue-ink)}
    .airi-doctor-dot{width:8px;height:8px;border-radius:50%;background:var(--blue);display:inline-block;flex:none}.airi-doctor-dot.yellow{background:var(--yellow)}
    .airi-doctor-empty{padding:18px;color:var(--muted)}.airi-doctor-pending{padding:14px 16px;border-bottom:1px solid var(--line)}.airi-doctor-pending:last-child{border:0}.airi-doctor-pending .airi-doctor-button{margin-top:10px}
    .airi-doctor-identity{position:sticky;top:calc(var(--shell-top, 60px) + 8px);z-index:2;padding:12px 16px;display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;margin-bottom:14px}.airi-doctor-identity h1{font-size:23px}
    .airi-doctor-brief-head{justify-content:space-between}.airi-doctor-brief-head>span{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
    .airi-doctor-brief{display:grid;grid-template-columns:1fr 1fr}.airi-doctor-block{padding:13px 15px;border-top:1px solid var(--line);min-width:0}.airi-doctor-block:nth-child(-n+2){border-top:0}.airi-doctor-block:nth-child(even){border-left:1px solid var(--line)}
    .airi-doctor-block h3{font:400 13px/1.5 var(--font-text);color:var(--muted);margin:0 0 5px}.airi-doctor-block p{font-size:14px}.airi-doctor-block .airi-doctor-chip{margin:8px 0 4px}
    .airi-doctor-source{display:block;font-size:12px;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}.airi-doctor-block-placeholder{height:15px;width:80%;background:var(--surface-2);border-radius:4px;margin:12px 0 7px}.airi-doctor-block-placeholder+div{width:55%}
    .airi-doctor-clinical{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
    .airi-doctor-odo,.airi-doctor-evolution{padding:16px}.airi-doctor-odo h2,.airi-doctor-evolution h2{margin:0 0 12px}.airi-doctor-odo-empty{min-height:140px;display:grid;place-content:center;text-align:center;color:var(--muted);padding:16px;background:var(--surface-2);border-radius:10px}
    .airi-doctor-steps{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}.airi-doctor-steps span{border-radius:99px;padding:3px 9px;font-size:12px;background:var(--surface-2);color:var(--muted)}.airi-doctor-steps span[aria-current=step]{background:var(--btn);color:var(--btn-ink)}
    .airi-doctor-evolution label{display:block;font-size:13px;margin-bottom:7px}.airi-doctor-evolution textarea{width:100%;min-height:210px;padding:12px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--ink);font:400 14px/1.6 var(--font-text);resize:vertical}
    .airi-doctor-evolution textarea::placeholder{color:var(--muted)}.airi-doctor-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}.airi-doctor-review{margin-top:12px;padding:12px;background:var(--yellow-soft);border-radius:10px;color:var(--yellow-ink)}.airi-doctor-review .airi-doctor-actions{margin-top:10px}
    .airi-doctor-view [role=alert]{color:var(--red-ink)}.airi-doctor-stamp{color:var(--green-ink);font-weight:500}.airi-doctor-warning{color:var(--yellow-ink)}
    .airi-shell--panel-open .airi-doctor-columns,.airi-shell--panel-open .airi-doctor-clinical{grid-template-columns:1fr}
    @media(max-width:900px){.airi-doctor-clinical,.airi-doctor-columns{grid-template-columns:1fr}.airi-doctor-next{flex-wrap:wrap}}
    @media(max-width:760px){.airi-doctor-view{padding:20px 16px 28px}.airi-doctor-view h1{font-size:25px}.airi-doctor-next{padding:16px;gap:12px}.airi-doctor-next .airi-doctor-button{width:100%}.airi-doctor-hour{min-width:72px;font-size:25px}.airi-doctor-brief{grid-template-columns:1fr}.airi-doctor-block:nth-child(2){border-top:1px solid var(--line)}.airi-doctor-block:nth-child(even){border-left:0}.airi-doctor-row{grid-template-columns:44px minmax(0,1fr);gap:8px}.airi-doctor-row>.airi-doctor-chip{grid-column:2;justify-self:start}.airi-doctor-evolution,.airi-doctor-odo{padding:14px}.airi-doctor-evolution textarea{min-height:250px}}
  `}</style>;
}
