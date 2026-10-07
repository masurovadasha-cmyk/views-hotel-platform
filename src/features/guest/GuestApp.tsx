import {useEffect,useMemo,useState} from "react";
import {
  AlertCircle,Bath,BedDouble,Bell,CalendarDays,Car,CheckCircle2,ChevronLeft,ChevronRight,CircleHelp,
  ConciergeBell,CreditCard,Heart,Map as MapIcon,MapPin,MessageCircle,Search,Send,Shirt,ShoppingBag,
  Sparkles,Star,UserRound,Users,UtensilsCrossed,Wine,Flower2
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {apartments} from "../../data/demo";
import {bookingQuote} from "../../domain/bookingQuote";
import type {Apartment} from "../../domain/types";
import {api} from "../../api/client";
import type {LiveBooking} from "../../api/types";

type Tab="explore"|"bookings"|"services"|"messages"|"profile";
type FlowScreen="apartment"|"booking"|"guest-data"|"payment"|"secure-processing"|"payment-declined"|"booking-confirmed"|"booking-details"|"cancellation-refund";
type ServiceTuple=readonly [string,LucideIcon,string];

const services:ServiceTuple[]=[
  ["Concierge",ConciergeBell,"concierge"],["Cleaning",Sparkles,"cleaning"],["Laundry",Shirt,"laundry"],
  ["Mini-market",ShoppingBag,"minimart"],["Restaurant",UtensilsCrossed,"restaurant"],["Bar",Wine,"bar"],["Rent Car",Car,"rent_car"],["Spa & Wellness",Flower2,"spa"]
];

export function GuestApp({live=false}:{live?:boolean}){
  const [tab,setTab]=useState<Tab>("explore");
  const [checkIn,setCheckIn]=useState("");
  const [checkOut,setCheckOut]=useState("");
  const [guests,setGuests]=useState(2);
  const [selected,setSelected]=useState<Apartment|null>(null);
  const [flow,setFlow]=useState<FlowScreen>("apartment");
  const [favorites,setFavorites]=useState<string[]>([]);
  const [view,setView]=useState<"list"|"map">("list");
  const [liveBookings,setLiveBookings]=useState<LiveBooking[]>([]);
  const [serviceBookingId,setServiceBookingId]=useState("");
  const [serviceCategory,setServiceCategory]=useState("concierge");
  const [serviceDetails,setServiceDetails]=useState("");
  const [serviceMessage,setServiceMessage]=useState("");
  const [alerts,setAlerts]=useState([
    {id:"n1",kind:"booking",title:"Booking confirmed",detail:"Your stay confirmation will appear here when backed by live data."},
    {id:"n2",kind:"service",title:"Service updates",detail:"Cleaning and concierge updates are grouped here."}
  ]);
  const [supportQuery,setSupportQuery]=useState("");
  const [smsCode,setSmsCode]=useState("");
  const [showSms,setShowSms]=useState(false);

  const filtered=useMemo(()=>apartments.filter(a=>a.capacity>=guests),[guests]);
  const quote=selected?bookingQuote({nightlyRate:selected.nightlyRate,checkIn,checkOut,capacity:selected.capacity,guests,paymentProviderConnected:false}):null;

  async function loadBookings(){
    if(!live)return;
    try{
      const result=await api.bookings();
      setLiveBookings(result.items);
      if(!serviceBookingId&&result.items[0])setServiceBookingId(result.items[0].id);
    }catch{setLiveBookings([])}
  }
  useEffect(()=>{void loadBookings()},[live]);

  const open=(a:Apartment)=>{setSelected(a);setFlow("apartment")};
  const toggle=(id:string)=>setFavorites(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const closeFlow=()=>{setSelected(null);setFlow("apartment")};
  const go=(screen:FlowScreen)=>setFlow(screen);
  const activeBooking=liveBookings[0]??null;

  return <main className="guestShell">
    {tab==="explore"&&<>
      <section className="hero"><div><span>PEOPLE · PLACES · POSSIBILITIES</span><h1>Stay beautifully.<br/>Move effortlessly.</h1></div><p>Book VIEWS apartments and manage your stay, services and concierge requests in one place.</p></section>

      <section className="welcomeStrip">
        <div><span className="vmark small">V</span><div><small>WELCOME</small><b>VIEWS Hotel & Apartments</b></div></div>
        <div><small>Quick access</small><button onClick={()=>setShowSms(true)}>SMS verification</button></div>
      </section>

      <section className="searchBox">
        <div className="location"><MapPin size={17}/><div><small>Destination</small><b>Tashkent</b></div></div>
        <label><small>Check-in</small><input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label>
        <label><small>Check-out</small><input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
        <label><small>Guests</small><input type="number" min={1} value={guests} onChange={e=>setGuests(Math.max(1,Number(e.target.value)||1))}/></label>
        <button className="primary"><Search size={16}/> Search</button>
      </section>

      <div className="filterRow">
        <button>Filters</button><button>Apartment</button><button>1 bedroom</button><button>Wi-Fi</button><button>Parking</button>
        <span>Live rates only · no estimated prices</span>
        <div className="viewSwitch"><button className={view==="list"?"on":""} onClick={()=>setView("list")}>List</button><button className={view==="map"?"on":""} onClick={()=>setView("map")}><MapIcon size={13}/> Map</button></div>
      </div>

      {view==="map"?<section className="mapStage"><div className="mapCanvas"><span className="mapPin a"><MapPin/>NRG U-Tower</span><span className="mapPin b"><MapPin/></span><span className="mapPin c"><MapPin/></span></div><aside><small>MAP</small><h2>Tashkent</h2><p>Map UI is ready. A live map provider will replace this staging canvas when connected.</p></aside></section>:<section>
        <div className="sectionHead"><div><small>EXPLORE VIEWS</small><h2>Available apartments</h2></div><span>{filtered.length} listings · select dates for live pricing</span></div>
        <div className="apartmentGrid">{filtered.map(a=><article className="apartmentCard" key={a.id}>
          <div className="photoWrap"><button className="photoButton" onClick={()=>open(a)}><img src={a.image} alt={a.title}/></button><button className="heart" onClick={()=>toggle(a.id)}><Heart size={18} fill={favorites.includes(a.id)?"currentColor":"none"}/></button></div>
          <div className="cardBody"><div><b>{a.title}</b><small>{a.property} · {a.city}</small></div><div className="facts"><span><BedDouble size={13}/>{a.bedrooms} BR</span><span><Users size={13}/>{a.capacity}</span><span><Bath size={13}/>{a.bathrooms}</span></div>
          <div className="priceRow"><strong>{a.nightlyRate===null?"Select dates for live rate":a.currency+" "+a.nightlyRate+" / night"}</strong><button onClick={()=>open(a)}>View</button></div></div>
        </article>)}</div>
      </section>}

      <section className="servicesSection"><div className="sectionHead"><div><small>ONE ECOSYSTEM</small><h2>Everything around your stay</h2></div></div><div className="serviceGrid">{services.map(([name,Icon])=><button key={name} onClick={()=>setTab("services")}><Icon/><b>{name}</b><small>Request in app</small></button>)}</div></section>
    </>}

    {tab==="bookings"&&<section className="contentPage">
      <div className="sectionHead"><div><small>MY BOOKINGS</small><h2>Trips & stays</h2></div></div>
      {live&&liveBookings.length?<div className="bookingStack">{liveBookings.map(b=><article className="bookingCard" key={b.id}><div><small>{b.city}</small><h3>{b.property_name}{b.unit_code?" · #"+b.unit_code:""}</h3><span>{b.check_in_date} → {b.check_out_date}</span></div><span className={"status "+b.status}>{b.status.replace(/_/g," ")}</span><div><strong>{b.total_amount===null?"Live total unavailable":b.currency+" "+b.total_amount}</strong><button onClick={()=>{setSelected(apartments[0]);setFlow("booking-details")}}>Details</button></div></article>)}</div>:<div className="emptyCard"><CalendarDays/><h3>{live?"No bookings found":"No live bookings seeded"}</h3><p>{live?"Only bookings linked to this authenticated guest are shown.":"Production bookings will appear only when linked to the authenticated guest."}</p></div>}
      <div className="policyCard"><b>Cancellation & refund</b><p>Exact refund calculations are shown before confirmation. No refund value is guessed.</p><button onClick={()=>{setSelected(apartments[0]);setFlow("cancellation-refund")}}>Review policy</button></div>
    </section>}

    {tab==="services"&&<section className="contentPage">
      <div className="sectionHead"><div><small>VIEWS SERVICES</small><h2>Everything for your stay</h2></div></div>
      <div className="serviceGrid large">{services.map(([name,Icon,value])=><button key={name} className={serviceCategory===value?"selectedService":""} onClick={()=>setServiceCategory(value)}><Icon/><b>{name}</b><small>Tracked Service Order</small></button>)}</div>
      {live?<form className="liveServiceForm" onSubmit={async e=>{e.preventDefault();setServiceMessage("");try{await api.createGuestServiceOrder({reservationId:serviceBookingId,category:serviceCategory,title:(services.find(x=>x[2]===serviceCategory)?.[0]??"Service")+" request",details:serviceDetails},crypto.randomUUID());setServiceDetails("");setServiceMessage("Request created and routed to VIEWS staff.")}catch(err){setServiceMessage(err instanceof Error?err.message:"Request failed")}}}>
        <label>Booking<select value={serviceBookingId} onChange={e=>setServiceBookingId(e.target.value)}>{liveBookings.map(b=><option key={b.id} value={b.id}>{b.confirmation_code} · {b.property_name}</option>)}</select></label>
        <label>Details<textarea value={serviceDetails} onChange={e=>setServiceDetails(e.target.value)} placeholder="Tell us what you need…"/></label>
        <button className="primary" disabled={!serviceBookingId||serviceDetails.trim().length<2}>Send request</button>{serviceMessage&&<div className="notice">{serviceMessage}</div>}
      </form>:<div className="serviceRequestMock"><label>From<input value="Airport" readOnly/></label><label>To<input value="Apartment" readOnly/></label><label>Date<input type="date"/></label><label>Time<input type="time"/></label><label className="full">Comment<textarea placeholder="Add a note…"/></label><button className="primary">Create request</button></div>}
    </section>}

    {tab==="messages"&&<section className="contentPage">
      <div className="sectionHead"><div><small>CONCIERGE</small><h2>Messages & requests</h2></div></div>
      <div className="chatShell"><header><span className="conciergeDot"><ConciergeBell/></span><div><b>VIEWS Concierge</b><small>Online when staff/AI connector is available</small></div></header><div className="chatBody"><div className="bubble">Hello. How can VIEWS help with your stay?</div><div className="bubble guest">I need an airport transfer at 14:00.</div><div className="bubble">Your request will be routed as a tracked Service Order.</div></div><footer><input placeholder="Message concierge…"/><button><Send size={16}/></button></footer></div>
    </section>}

    {tab==="profile"&&<section className="contentPage">
      <div className="profileHero"><UserRound/><div><small>VIEWS PROFILE</small><h2>Guest profile</h2><p>Payments use provider-hosted checkout. VIEWS never collects raw card details.</p></div></div>
      <div className="profileGrid">
        <button onClick={()=>setAlerts(a=>a)}><Bell/><b>Notifications</b><small>{alerts.length} updates</small></button>
        <button><Heart/><b>Favorites</b><small>{favorites.length} saved</small></button>
        <button><Star/><b>My reviews</b><small>Share your stay</small></button>
        <button><CreditCard/><b>Payment methods</b><small>Provider-hosted only</small></button>
      </div>
      <section className="notificationPanel"><h3>Notifications</h3>{alerts.map(a=><article key={a.id}><span className="notificationDot"/><div><b>{a.title}</b><small>{a.detail}</small></div></article>)}</section>
      <section className="helpPanel"><h3>Help & support</h3><input value={supportQuery} onChange={e=>setSupportQuery(e.target.value)} placeholder="Search help…"/><div className="helpLinks"><button>Modify booking</button><button>Refund status</button><button>Registration instructions</button><button>Payment methods</button><button>Contact support</button></div></section>
    </section>}

    <nav className="guestNav">{[["explore",Search],["bookings",CalendarDays],["services",ConciergeBell],["messages",MessageCircle],["profile",UserRound]].map(([id,Icon])=><button className={tab===id?"active":""} key={id as string} onClick={()=>setTab(id as Tab)}><Icon size={18}/><span>{id as string}</span></button>)}</nav>

    {showSms&&<div className="modalBack" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSms(false)}}><div className="phoneModal"><div className="brandMini"><span className="vmark">V</span><b>VIEWS</b></div><h2>Enter code</h2><p>We sent a verification code to your phone.</p><div className="smsDigits"><input value={smsCode} onChange={e=>setSmsCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="123456"/></div><button className="primary" onClick={()=>setShowSms(false)}>Verify</button><button onClick={()=>setShowSms(false)}>Cancel</button></div></div>}

    {selected&&<div className="modalBack" onMouseDown={e=>{if(e.target===e.currentTarget)closeFlow()}}><div className="modal journeyModal">
      <div className="journeyHead"><button onClick={()=>flow==="apartment"?closeFlow():go(flow==="booking"?"apartment":flow==="guest-data"?"booking":flow==="payment"?"guest-data":"apartment")}><ChevronLeft/></button><div><small>VIEWS GUEST JOURNEY</small><b>{flow.replace(/-/g," ")}</b></div><button onClick={closeFlow}>Close</button></div>

      {flow==="apartment"&&<>
        <img className="modalPhoto" src={selected.image} alt={selected.title}/><div className="sectionHead"><div><small>{selected.property}</small><h2>{selected.title}</h2></div><strong>{selected.nightlyRate===null?"Select dates for live rate":selected.currency+" "+selected.nightlyRate}</strong></div>
        <div className="facts">{selected.amenities.map(x=><span key={x}>{x}</span>)}</div><p className="modalCopy">Premium VIEWS apartment with modern interiors and hotel-style service. Availability and price are resolved from live data only.</p><button className="primary wide" onClick={()=>go("booking")}>Choose dates</button>
      </>}

      {flow==="booking"&&<div className="flow"><h2>Booking</h2><div className="two"><label>Check-in<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Check-out<input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div><label>Guests<input type="number" value={guests} min={1} max={selected.capacity} onChange={e=>setGuests(Number(e.target.value)||1)}/></label><div className="extras"><label><input type="checkbox"/> Airport transfer</label><label><input type="checkbox"/> Cleaning</label><label><input type="checkbox"/> Late check-out</label></div><div className="priceSummary"><span>Stay</span><b>{quote?.total===null?"Live total unavailable":selected.currency+" "+quote?.total}</b><span>Services</span><b>Calculated when selected</b><span>Total</span><strong>{quote?.total===null?"—":selected.currency+" "+quote?.total}</strong></div><button className="primary wide" disabled={!quote?.canContinue} onClick={()=>go("guest-data")}>Continue</button></div>}

      {flow==="guest-data"&&<div className="flow"><h2>Guest data</h2><label>Full name<input placeholder="Primary guest"/></label><label>Date of birth<input type="date"/></label><label>Nationality<select><option>Uzbekistan</option><option>Other</option></select></label><label>Passport / ID<input placeholder="Secure upload required" readOnly/></label><div className="notice">Document upload remains disabled until encrypted file storage is connected.</div><button className="primary wide" onClick={()=>go("payment")}>Continue</button></div>}

      {flow==="payment"&&<div className="flow"><h2>Payment</h2><div className="providerRow"><button>Payme</button><button>Click</button><button>Uzum</button><button>Bank card</button></div><div className="notice">VIEWS never collects raw card details. Checkout opens on the payment provider/bank page.</div><button className="primary wide" disabled onClick={()=>go("secure-processing")}>Continue to secure payment</button><button onClick={()=>go("payment-declined")}>Preview declined state</button><button onClick={()=>go("booking-confirmed")}>Preview confirmation state</button></div>}

      {flow==="secure-processing"&&<StateScreen icon={<CreditCard/>} title="Secure payment" text="The bank/provider 3-D Secure page opens here. Timeout and back navigation are handled without marking payment successful."/>}
      {flow==="payment-declined"&&<StateScreen danger icon={<AlertCircle/>} title="Payment declined" text="The bank declined the payment. No booking confirmation is issued. Try again or choose another payment method." action="Retry payment" onAction={()=>go("payment")}/>}
      {flow==="booking-confirmed"&&<StateScreen success icon={<CheckCircle2/>} title="Booking confirmed" text="Confirmation is shown only after a verified booking/payment response. Booking code and arrival instructions come from backend data." action="Booking details" onAction={()=>go("booking-details")}/>}
      {flow==="booking-details"&&<div className="flow"><h2>Booking details</h2><img className="bookingDetailPhoto" src={selected.image} alt={selected.title}/><div className="detailRows"><span>Property<b>{selected.property}</b></span><span>Dates<b>{checkIn||"Select date"} → {checkOut||"Select date"}</b></span><span>Access code<b>Available after backend confirmation</b></span><span>Address<b>NRG U-Tower, Tashkent</b></span><span>Documents<b>Registration / check-in documents</b></span></div><button className="primary wide" onClick={()=>go("cancellation-refund")}>Change / cancel booking</button></div>}
      {flow==="cancellation-refund"&&<div className="flow"><h2>Cancellation & refund</h2><div className="policyTimeline"><span><b>72+ hours</b>Refund according to booked rate plan</span><span><b>24–72 hours</b>Partial refund if rate plan allows</span><span><b>&lt;24 hours</b>Exact backend policy required</span></div><div className="refundBox"><span>Refund calculation</span><strong>Calculated from live booking policy</strong><small>No amount is fabricated in staging.</small></div><button className="primary wide" disabled>Confirm cancellation</button></div>}
    </div></div>}
  </main>
}

function StateScreen({icon,title,text,action,onAction,danger,success}:{icon:React.ReactNode;title:string;text:string;action?:string;onAction?:()=>void;danger?:boolean;success?:boolean}){
  return <div className={"stateScreen "+(danger?"danger":"")+(success?" success":"")}><div className="stateIcon">{icon}</div><h2>{title}</h2><p>{text}</p>{action&&<button className="primary" onClick={onAction}>{action}</button>}</div>
}
