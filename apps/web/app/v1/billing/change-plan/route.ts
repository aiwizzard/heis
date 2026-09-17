import {NextResponse} from "next/server";
import Stripe from "stripe";
import {env} from "@/lib/env";
import {PLANS,priceForPlan} from "@/lib/plans";
import {requireUser} from "@/lib/supabase";
import {apiError,requireIdempotencyKey} from "@/lib/http";
export async function POST(request:Request) {
 try {
  const key=requireIdempotencyKey(request);const {client,user}=await requireUser(request);const {plan}=await request.json();
  if(plan!=="creator"&&plan!=="pro")return new Response("Invalid plan",{status:400});
  const stored=await client.from("subscriptions").select("stripe_subscription_id,status").eq("user_id",user.id).single();
  if(stored.error||stored.data.status!=="active")return new Response("An active subscription is required",{status:409});
  const stripe=new Stripe(env.stripeSecretKey());const priceId=priceForPlan(plan);const price=await stripe.prices.retrieve(priceId);
  if(!price.active||price.currency!=="usd"||price.unit_amount!==PLANS[plan as "creator"|"pro"].monthlyUsd*100||price.recurring?.interval!=="month"||price.recurring.interval_count!==1)throw new Error("Invalid subscription price configuration");
  const sub=await stripe.subscriptions.retrieve(stored.data.stripe_subscription_id);const item=sub.items.data[0];
  if(sub.cancel_at_period_end||sub.status!=="active"||sub.items.data.length!==1)throw new Error("Resolve your current billing status before changing plans.");
  const schedule=sub.schedule?await stripe.subscriptionSchedules.retrieve(typeof sub.schedule==="string"?sub.schedule:sub.schedule.id):await stripe.subscriptionSchedules.create({from_subscription:sub.id},{idempotencyKey:`${user.id}:${key}:create`});
  const current=schedule.phases.find(p=>p.start_date<=Date.now()/1000&&p.end_date>Date.now()/1000);
  if(!current)throw new Error("No current billing phase found");
  await stripe.subscriptionSchedules.update(schedule.id,{end_behavior:"release",proration_behavior:"none",phases:[{start_date:current.start_date,end_date:item.current_period_end,items:[{price:item.price.id,quantity:1}],metadata:{user_id:user.id}},{start_date:item.current_period_end,items:[{price:priceId,quantity:1}],iterations:1,metadata:{user_id:user.id,plan},proration_behavior:"none"}]},{idempotencyKey:`${user.id}:${key}:update`});
  return NextResponse.json({scheduled:true,effectiveAt:new Date(item.current_period_end*1000).toISOString()});
 }catch(error){return apiError(error);}
}
