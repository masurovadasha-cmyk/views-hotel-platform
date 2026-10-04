import { useEffect, useMemo, useState } from "react";
import { Bath, BedDouble, CalendarDays, Car, ConciergeBell, Heart, MapPin, MessageCircle, Search, Shirt, ShoppingBag, Sparkles, UserRound, Users, UtensilsCrossed, Wine } from "lucide-react";
import { apartments } from "../../data/demo";
import { bookingQuote } from "../../domain/bookingQuote";
import type { Apartment } from "../../domain/types";
import { api } from "../../api/client";
import type { LiveBooking } from "../../api/types";

type Tab="explore"|"bookings"|"services"|"messages"|"profile";
const services=[["Concierge",ConciergeBell,"concierge"],["Cleaning",Sparkles,"cleaning"],["Laundry",Shirt,"laundry"],["Mini-market",ShoppingBag,"minimart"],["Restaurant",UtensilsCrossed,"restaurant"],["Bar",Wine,"bar"],["Rent Car",Car,"rent_car"]] as const;

export function GuestApp({live=false}:{live?:boolean}){
  const [tab,setTab]=useState<Tab>("explore");
  const [checkIn,setCheckIn]=useState("");
  const [checkOut,setCheckOut]=useState("");
  const [guests,setGuests]=useState(2);
  const [selected,setSelected]=useState<Apartment|null>(null);
  const [step,setStep]=useState(1);
  const [favorites,setFavorites]=useState<string[]>([]);
  const [liveBookings,setLiveBookings]=useState<LiveBooking[]>([]);
  const [serviceBookingId,setServiceBookingId]=useState("");
  const [serviceCategory,setServiceCategory]=useState("concierge");
  const [serviceDetails,setServiceDetails]=useState("");
  const [serviceMessage,setServiceMessage]=useState("");

  async function loadBookings(){
    if(!live)return;
    try{
      const result=await api.bookings();
      setLiveBookings(result.items);
      if(!serviceBookingId&&result.items[0])setServiceBookingId(result.items[0].id);
    }catch{setLiveBookings([])}
  }
  useEffect(()=>{void loadBookings()},[live]);
  const filtered=useMemo(()=>apartments.filter(a=>a.capacity>=guests),[guests]);
  const quote=selected?bookingQuote({nightlyRate:selected.nightlyRate,checkIn,checkOut,capacity:selected.capacity,guests,paymentProviderConnected:false}):null;
  const open=(a:Apartment)=>{setSelected(a);setStep(1)};
  const toggle=(id:string)=>setFavorites(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);

  return <main className="guestShell">
    {tab==="explore"&&<>
      <section className="hero"><div><span>PEOPLE · PLACES · POSSIBILITIES</span><h1>Stay beautifully.<br/>Move effortlessly.</h1></div><p>Book VIEWS apartments and manage your stay, services and concierge requests in one place.</p></section>
      <section className="searchBox">
        <div className="location"><MapPin size={17}/><div><small>Destination</small><b>Tashkent</b></div></div>
        <label><small>Check-in</small><input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label>
        <label><small>Check-out</small><input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
        <label><small>Guests</small><input type="number" min={1} value={guests} onChange={e=>setGuests(Math.max(1,Number(e.target.value)||1))}/></label>
        <button className="primary"><Search size={16}/> Search</button>
      </section>
      <div className="filterRow"><button>Filters</button><button>Apartment</button><button>1 bedroom</button><button>Wi-Fi</button><button>Parking</button><span>Live rates only · no estimated prices</span></div>
      <section><div className="sectionHead"><div><small>EXPLORE VIEWS</small><h2>Available apartments</h2></div><span>{filtered.length} listings · select dates for live pricing</span></div>
        <div className="apartmentGrid">{filtered.map(a=><article className="apartmentCard" key={a.id}>
          <div className="photoWrap"><button className="photoButton" onClick={()=>open(a)}><img src={a.image} alt={a.title}/></button><button className="heart" onClick={()=>toggle(a.id)}><Heart size={18} fill={favorites.includes(a.id)?"currentColor":"none"}/></button></div>
          <div className="cardBody"><div><b>{a.title}</b><small>{a.property} · {a.city}</small></div><div className="facts"><span><BedDouble size={13}/>{a.bedrooms} BR</span><span><Users size={13}/>{a.capacity}</span><span><Bath size={13}/>{a.bathrooms}</span></div>
          <div className="priceRow"><strong>{a.nightlyRate===null?"Select dates for live rate":a.currency+" "+a.nightlyRate+" / night"}</strong><button onClick={()=>open(a)}>View</button></div></div>
        </article>)}</div>
      </section>
      <section className="servicesSection"><div className="sectionHead"><div><small>ONE ECOSYSTEM</small><h2>Everything around your stay</h2></div></div><div className="serviceGrid">{services.map(([name,Icon])=><button key={name} onClick={()=>setTab("services")}><Icon/><b>{name}</b><small>Request in app</small></button>)}</div></section>
    </>}
    {tab==="bookings"&&<section className="contentPage"><div className="sectionHead"><div><small>MY BOOKINGS</small><h2>Trips & stays</h2></div></div>{live&&liveBookings.length?<div className="orderList">{liveBookings.map(b=><article className="order" key={b.id}><div><b>{b.property_name}{b.unit_code?" · #"+b.unit_code:""}</b><span>{b.confirmation_code} · {b.check_in_date} → {b.check_out_date}</span></div><span className={"status "+b.status}>{b.status.replaceAll("_"," ")}</span><div>{b.total_amount===null?"Live total unavailable":b.currency+" "+b.total_amount}</div></article>)}</div>:<div className="emptyCard"><CalendarDays/><h3>{live?"No bookings found":"No live bookings seeded"}</h3><p>{live?"Only bookings linked to this authenticated guest are shown.":"Production bookings will appear only when linked to the authenticated guest."}</p></div>}</section>}
    {tab==="services"&&<section className="contentPage"><div className="sectionHead"><div><small>VIEWS SERVICES</small><h2>Everything for your stay</h2></div></div><div className="serviceGrid large">{services.map(([name,Icon,value])=><button key={name} className={serviceCategory===value?"selectedService":""} onClick={()=>setServiceCategory(value)}><Icon/><b>{name}</b><small>Tracked Service Order</small></button>)}</div>{live?<form className="liveServiceForm" onSubmit={async e=>{e.preventDefault();setServiceMessage("");try{await api.createGuestServiceOrder({reservationId:serviceBookingId,category:serviceCategory,title:services.find(x=>x[2]===serviceCategory)?.[0]+" request",details:serviceDetails},crypto.randomUUID());setServiceDetails("");setServiceMessage("Request created and routed to VIEWS staff.")}catch(err){setServiceMessage(err instanceof Error?err.message:"Request failed")}}}><label>Booking<select value={serviceBookingId} onChange={e=>setServiceBookingId(e.target.value)}>{liveBookings.map(b=><option key={b.id} value={b.id}>{b.confirmation_code} · {b.property_name}</option>)}</select></label><label>Details<textarea value={serviceDetails} onChange={e=>setServiceDetails(e.target.value)} placeholder="Tell us what you need…"/></label><button className="primary" disabled={!serviceBookingId||serviceDetails.trim().length<2}>Send request</button>{serviceMessage&&<div className="notice">{serviceMessage}</div>}</form>:<div className="notice">Service requests become tracked Service Orders with assignee, SLA, timeline and audit history.</div>}</section>}
    {tab==="messages"&&<section className="contentPage"><div className="sectionHead"><div><small>CONCIERGE</small><h2>Messages & requests</h2></div></div><div className="chat"><div className="bubble">VIEWS Concierge is ready when an active booking exists.</div></div></section>}
    {tab==="profile"&&<section className="contentPage"><div className="profileHero"><UserRound/><div><small>VIEWS PROFILE</small><h2>Guest profile</h2><p>Payments use provider-hosted checkout. VIEWS never collects raw card details.</p></div></div></section>}
    <nav className="guestNav">{[["explore",Search],["bookings",CalendarDays],["services",ConciergeBell],["messages",MessageCircle],["profile",UserRound]].map(([id,Icon])=><button className={tab===id?"active":""} key={id as string} onClick={()=>setTab(id as Tab)}><Icon size={18}/><span>{id as string}</span></button>)}</nav>
    {selected&&<div className="modalBack" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modal">
      <div className="sectionHead"><div><small>APARTMENT DETAILS</small><h2>{selected.title}</h2></div><button onClick={()=>setSelected(null)}>Close</button></div>
      <img className="modalPhoto" src={selected.image} alt={selected.title}/><div className="facts">{selected.amenities.map(x=><span key={x}>{x}</span>)}</div>
      <div className="steps"><span className={step>=1?"on":""}>1 Dates</span><i/><span className={step>=2?"on":""}>2 Guest</span><i/><span className={step>=3?"on":""}>3 Payment</span></div>
      {step===1&&<div className="flow"><div className="two"><label>Check-in<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Check-out<input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div><label>Guests<input type="number" value={guests} min={1} max={selected.capacity} onChange={e=>setGuests(Number(e.target.value)||1)}/></label><div className="notice">{quote?.rateAvailable?"Live rate available":"Live rate unavailable — no price is invented."}</div><button className="primary" disabled={!quote?.canContinue} onClick={()=>setStep(2)}>Continue</button></div>}
      {step===2&&<div className="flow"><label>Primary guest<input value="Authenticated guest profile" readOnly/></label><label>Passport / ID<input value="Secure upload integration required" readOnly/></label><div className="notice">Document upload stays disabled until secure storage/privacy controls are connected.</div><button className="primary" onClick={()=>setStep(3)}>Continue</button></div>}
      {step===3&&<div className="flow"><div className="providerRow"><span>Payme</span><span>Click</span><span>Uzum</span><span>Bank card</span></div><div className="notice">Secure payment is disabled until a verified live rate and payment provider are connected.</div><button className="primary" disabled>Continue to secure payment</button></div>}
    </div></div>}
  </main>
}
