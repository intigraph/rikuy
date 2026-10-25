// Disposable native qualification helper. It is not a production operator tool.
use quipu::store::attested_write::{AttestedDatum, Proposal, TypedValue};
use quipu::types::{Op, Value};
use quipu::{Datum, Store};
use serde_json::{Value as J, json};
use std::io::Read;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<String> = std::env::args().collect();
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw)?;
    let v: J = serde_json::from_str(&raw)?;
    let mut s = Store::open(&a[1])?;
    let out = match a[2].as_str() {
        "seed" => {
            let g = s.graph_create(v["graph"].as_str().unwrap())?;
            let rows: Vec<AttestedDatum> = serde_json::from_value(v["datums"].clone())?;
            let ts = "2026-10-25T00:00:00Z";
            let mut ds = Vec::new();
            for d in rows {
                let value = match d.o {
                    TypedValue::Int(n) => Value::Int(n),
                    TypedValue::Str(t) => Value::Str(t),
                    TypedValue::Iri(t) => Value::Ref(s.intern(&t)?),
                };
                ds.push(Datum {
                    entity: s.intern(&d.s)?,
                    attribute: s.intern(&d.p)?,
                    value,
                    valid_from: ts.into(),
                    valid_to: None,
                    op: if v["retract"].as_bool().unwrap_or(false) {
                        Op::Retract
                    } else {
                        Op::Assert
                    },
                });
            }
            s.transact_to_graph(&ds, ts, None, None, g)?;
            json!({"seeded":true})
        }
        "canonical" => {
            let p: Proposal = serde_json::from_value(v)?;
            json!({"canonical":serde_json::to_string(&p)?})
        }
        "challenge" => quipu::tool_attest_challenge(&mut s, &v)?,
        "commit" => quipu::tool_attest_commit(&mut s, &v)?,
        "receipt" => quipu::tool_attest_receipt(&s, &v)?,
        "store-id" => json!({"store_id":s.store_id()?}),
        "graphs" => quipu::tool_graph_list(&s, &v)?,
        "ask" => quipu::tool_ask(&s, &v)?,
        "query-load" => {
            use quipu::store::queries::{StoredParam, StoredQuery};
            let params = v["params"]
                .as_object()
                .unwrap()
                .iter()
                .map(|(name, kind)| StoredParam {
                    name: name.clone(),
                    kind: match kind.as_str().unwrap() {
                        "iri" => "iri".into(),
                        "int" => "int".into(),
                        _ => panic!("fixture parameter kind"),
                    },
                    required: true,
                    default: None,
                    description: "Synthetic reader qualification".into(),
                })
                .collect();
            s.query_load(
                &StoredQuery {
                    name: v["name"].as_str().unwrap().into(),
                    description: "Disposable Rikuy reader definition".into(),
                    template: v["template"].as_str().unwrap().into(),
                    dataset: None,
                    params,
                },
                "2026-10-25T00:00:00Z",
            )?;
            json!({"loaded":true})
        }
        "facts" => {
            let g = s.lookup(v["graph"].as_str().unwrap())?.unwrap();
            let mut rows = Vec::new();
            for f in s.current_facts_in_graph(g)? {
                let o = match f.value {
                    Value::Int(n) => json!({"kind":"int","value":n}),
                    Value::Str(t) => json!({"kind":"str","value":t}),
                    Value::Ref(i) => json!({"kind":"iri","value":s.resolve(i)?}),
                    _ => continue,
                };
                rows.push(json!({"s":s.resolve(f.entity)?,"p":s.resolve(f.attribute)?,"o":o}));
            }
            json!({"datums":rows})
        }
        _ => panic!("fixture verb"),
    };
    println!("{}", serde_json::to_string(&out)?);
    Ok(())
}
