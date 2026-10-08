import sys,json
from sqlalchemy import create_engine,text
from ops import BE,OUT,envfile,record
engine=create_engine(envfile(BE/'.env.local')['DATABASE_URL'])
queries={
'proposals':'SELECT id,agent_key,kind,status,proposed_by_principal_id,decided_by_principal_id,result_ref,error_code FROM agent_proposals ORDER BY id',
'outbound':'SELECT id,message_id,conversation_id,status,attempt_count FROM outbound_messages ORDER BY id',
'messages':'SELECT id,conversation_id,direction,delivery_status,body_text FROM messages ORDER BY id',
'movements':'SELECT id,product_id,location_id,type,quantity,transfer_id FROM inventory_movements ORDER BY id',
'receipts':'SELECT id,principal_id,operation,idempotency_key,resource_type,resource_id,outcome_json FROM command_receipts ORDER BY id',
'sandbox_receipts':'SELECT id,outbound_id,provider_message_id FROM sandbox_delivery_receipts ORDER BY id',
'handoffs':'SELECT h.id,h.conversation_id,h.status,c.assigned_principal_id FROM reception_handoffs h JOIN conversations c ON c.id=h.conversation_id ORDER BY h.id',
'appointment':'SELECT id,state,start_utc,lead_id,patient_id FROM appointments WHERE id=39',
'balances':'SELECT product_id,location_id,sum(quantity) AS raw_quantity_sum FROM inventory_movements GROUP BY product_id,location_id ORDER BY product_id,location_id',
}
result={}
with engine.connect() as conn:
 for name,q in queries.items():
  try: result[name]=[dict(x) for x in conn.execute(text(q)).mappings()]
  except Exception as e: conn.rollback(); result[name]={'error':str(e).split('[SQL:')[0]}
p=OUT/(sys.argv[1]+'.json'); p.write_text(json.dumps(result,default=str,indent=2,ensure_ascii=False)); print(p.name,{k:len(v) for k,v in result.items()});record(['db_snapshot.py',sys.argv[1]],BE,0)
