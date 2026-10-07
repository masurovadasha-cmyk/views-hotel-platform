import {GuestDialog} from './GuestDialog';
import {useGuestLocale} from './GuestLocale';
import {useEffect,useMemo,useState} from "react";
import {SmsUnavailableDialog} from "./SmsUnavailableDialog";
import {
  AlertCircle,Bath,BedDouble,Bell,CalendarDays,Car,CheckCircle2,
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
const tabLabels:Record<Tab,string>={explore:'Explore',bookings:'Bookings',services:'Services',messages:'Messages',profile:'Profile'};
const flowLabels:Record<FlowScreen,string>={apartment:'Apartment',booking:'Booking','guest-data':'Guest data',payment:'Payment','secure-processing':'Secure payment','payment-declined':'Payment declined','booking-confirmed':'Confirmation screen preview','booking-details':'Booking details','cancellation-refund':'Cancellation & refund'};
function bookingStatus(status:string){return ({confirmed:'Confirmed',checked_in:'Checked in',checked_out:'Checked out',cancelled:'Cancelled',hold:'Temporary hold',pending:'Pending',no_show:'No-show'} as Record<string,string>)[status]||'Unknown status';}
type ServiceTuple=readonly [string,LucideIcon,string];

const helpTopics=[
 ['Modify booking','Booking changes are not connected in this interface. Contact the property through your confirmed booking channel.'],
 ['Refund status','Exact refund calculations are shown before confirmation. No refund value is guessed.'],
 ['Registration instructions','Document upload remains disabled until encrypted file storage is connected.'],
 ['Payment methods','VIEWS never collects raw card details. Checkout opens on the payment provider/bank page.'],
 ['Contact support','Support contact details have not been configured.']
] as const;
const services:ServiceTuple[]=[
  ["Concierge",ConciergeBell,"concierge"],["Cleaning",Sparkles,"cleaning"],["Laundry",Shirt,"laundry"],
  ["Mini-market",ShoppingBag,"minimart"],["Restaurant",UtensilsCrossed,"restaurant"],["Bar",Wine,"bar"],["Rent Car",Car,"rent_car"],["Spa & Wellness",Flower2,"spa"]
];

export function GuestApp({live=false}:{live?:boolean}){
  const {t}=useGuestLocale();
  const [bookingDetails,setBookingDetails]=useState<LiveBooking|null>(null);
  const [bookingsError,setBookingsError]=useState(false),[bookingsLoading,setBookingsLoading]=useState(false);
  const [tab,setTab]=useState<Tab>("explore");
  const [checkIn,setCheckIn]=useState("");
  const [checkOut,setCheckOut]=useState("");
  const [guests,setGuests]=useState(2);
  const [selected,setSelected]=useState<Apartment|null>(null);
  const [flow,setFlow]=useState<FlowScreen>("apartment");
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [favorites,setFavorites]=useState<string[]>([]);
  const [view,setView]=useState<"list"|"map">("list");
  const [liveBookings,setLiveBookings]=useState<LiveBooking[]>([]);
  const [serviceBookingId,setServiceBookingId]=useState("");
  const [serviceCategory,setServiceCategory]=useState("concierge");
  const [serviceDetails,setServiceDetails]=useState("");
  const [serviceMessage,setServiceMessage]=useState("");
  const [alerts]=useState([
    {id:"n1",kind:"booking",title:"Booking updates",detail:"Your stay confirmation will appear here when backed by live data."},
    {id:"n2",kind:"service",title:"Service updates",detail:"Cleaning and concierge updates are grouped here."}
  ]);
  const [supportQuery,setSupportQuery]=useState("");
  const [showSms,setShowSms]=useState(false);

  const filtered=useMemo(()=>apartments.filter(a=>a.capacity>=guests&&(!onlyFavorites||favorites.includes(a.id))),[guests,onlyFavorites,favorites]);
  const quote=selected?bookingQuote({nightlyRate:selected.nightlyRate,checkIn,checkOut,capacity:selected.capacity,guests,paymentProviderConnected:false}):null;

  async function loadBookings(){
    if(!live)return;
    setBookingsLoading(true);setBookingsError(false);
    try{
      const result=await api.bookings();
      setLiveBookings(result.items);
      if(!serviceBookingId&&result.items[0])setServiceBookingId(result.items[0].id);
    }catch{setLiveBookings([]);setBookingsError(true)}finally{setBookingsLoading(false)}
  }
  useEffect(()=>{void loadBookings()},[live]);

  const open=(a:Apartment)=>{setSelected(a);setFlow("apartment")};
  const toggle=(id:string)=>setFavorites(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const closeFlow=()=>{setSelected(null);setFlow("apartment")};
  const go=(screen:FlowScreen)=>setFlow(screen);


  return <main className="guestShell">
    {!live&&<p className="notice" role="status">{t("Demo catalog. No booking, payment, service request or message is sent.")}</p>}
    {tab==="explore"&&<>
      <section className="hero"><div><span>{t("PEOPLE · PLACES · POSSIBILITIES")}</span><h1>{t("Stay beautifully.")}<br/>{t("Move effortlessly.")}</h1></div><p>{t("Book VIEWS apartments and manage your stay, services and concierge requests in one place.")}</p></section>

      <section className="welcomeStrip">
        <div><span className="vmark small">V</span><div><small>{t("WELCOME")}</small><b>VIEWS Hotel & Apartments</b></div></div>
        <div><small>{t("Quick access")}</small><button onClick={()=>setShowSms(true)}>{t("SMS verification")}</button></div>
      </section>

      <section className="searchBox">
        <div className="location"><MapPin size={17}/><div><small>{t("Destination")}</small><b>{t("Tashkent")}</b></div></div>
        <label><small>{t("Check-in")}</small><input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label>
        <label><small>{t("Check-out")}</small><input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
        <label><small>{t("Guests")}</small><input type="number" min={1} value={guests} onChange={e=>setGuests(Math.max(1,Number(e.target.value)||1))}/></label>
        <button className="primary" onClick={()=>document.getElementById("guest-results")?.focus()}><Search size={16}/> {' '}{t("Show results")}</button>
      </section>

      <div className="filterRow">
        <button aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(value=>!value)}>{onlyFavorites?t("Show all apartments"):t("Favorites only")}</button>
        <span>{t("Prices are unavailable until a rate source is connected")}</span>
        <div className="viewSwitch"><button className={view==="list"?"on":""} onClick={()=>setView("list")}>{t("List")}</button><button className={view==="map"?"on":""} onClick={()=>setView("map")}><MapIcon size={13}/> {' '}{t("Map")}</button></div>
      </div>

      {view==="map"?<section className="mapStage" id="guest-results" tabIndex={-1}><div className="mapCanvas"><span className="mapPin a"><MapPin/>NRG U-Tower</span><span className="mapPin b"><MapPin/></span><span className="mapPin c"><MapPin/></span></div><aside><small>{t("MAP")}</small><h2>{t("Tashkent")}</h2><p>{t("Map UI is ready. A live map provider will replace this staging canvas when connected.")}</p></aside></section>:<section id="guest-results" tabIndex={-1}>
        <div className="sectionHead"><div><small>{t("EXPLORE VIEWS")}</small><h2>{t("Available apartments")}</h2></div><span>{t('Listings: {count}. Choose dates to preview the booking steps.',{count:filtered.length})}</span></div>
        {filtered.length===0&&<p role="status">{t("No apartments match. Change the guest count or turn off the favorites filter.")}</p>}<div className="apartmentGrid">{filtered.map(a=><article className="apartmentCard" key={a.id}>
          <div className="photoWrap"><button className="photoButton" onClick={()=>open(a)}><img src={a.image} alt={t(a.title)}/></button><button className="heart" aria-label={t(favorites.includes(a.id)?'Remove from favorites: {name}':'Add to favorites: {name}',{name:t(a.title)})} aria-pressed={favorites.includes(a.id)} onClick={()=>toggle(a.id)}><Heart size={18} fill={favorites.includes(a.id)?"currentColor":"none"}/></button></div>
          <div className="cardBody"><div><b>{t(a.title)}</b><small>{a.property} · {t(a.city)}</small></div><div className="facts"><span><BedDouble size={13}/>{t('Bedrooms: {count}',{count:a.bedrooms})}</span><span><Users size={13}/>{a.capacity}</span><span><Bath size={13}/>{a.bathrooms}</span></div>
          <div className="priceRow"><strong>{a.nightlyRate===null?t("Select dates for live rate"):a.currency+" "+a.nightlyRate+t(" / night")}</strong><button onClick={()=>open(a)}>{t("View")}</button></div></div>
        </article>)}</div>
      </section>}

      <section className="servicesSection"><div className="sectionHead"><div><small>{t("ONE ECOSYSTEM")}</small><h2>{t("Everything around your stay")}</h2></div></div><div className="serviceGrid">{services.map(([name,Icon])=><button key={name} onClick={()=>setTab("services")}><Icon/><b>{t(name)}</b><small>{t("Request in app")}</small></button>)}</div></section>
    </>}

    {tab==="bookings"&&<section className="contentPage">
      <div className="sectionHead"><div><small>{t("MY BOOKINGS")}</small><h2>{t("Trips & stays")}</h2></div></div>
      {live&&bookingsLoading?<p role="status">{t("Loading bookings…")}</p>:live&&bookingsError?<div role="alert"><p>{t("Could not load bookings. Check your connection and try again.")}</p><button onClick={()=>void loadBookings()}>{t("Retry")}</button></div>:live&&liveBookings.length?<div className="bookingStack">{liveBookings.map(b=><article className="bookingCard" key={b.id}><div><small>{b.city}</small><h3>{b.property_name}{b.unit_code?" · #"+b.unit_code:""}</h3><span>{b.check_in_date} → {b.check_out_date}</span></div><span className={"status "+b.status}>{t(bookingStatus(b.status))}</span><div><strong>{b.total_amount===null?t("Live total unavailable"):b.currency+" "+b.total_amount}</strong><button onClick={()=>setBookingDetails(b)}>{t("Details")}</button></div></article>)}</div>:<div className="emptyCard"><CalendarDays/><h3>{live?t("No bookings found"):t("No live bookings seeded")}</h3><p>{live?t("Only bookings linked to this authenticated guest are shown."):t("Production bookings will appear only when linked to the authenticated guest.")}</p></div>}
      <div className="policyCard"><b>{t("Cancellation & refund")}</b><p>{t("Exact refund calculations are shown before confirmation. No refund value is guessed.")}</p><button onClick={()=>{setSelected(apartments[0]);setFlow("cancellation-refund")}}>{t("Preview policy screen")}</button></div>
    </section>}

    {tab==="services"&&<section className="contentPage">
      <div className="sectionHead"><div><small>{t("VIEWS SERVICES")}</small><h2>{t("Everything for your stay")}</h2></div></div>
      <div className="serviceGrid large">{services.map(([name,Icon,value])=><button key={name} className={serviceCategory===value?"selectedService":""} onClick={()=>setServiceCategory(value)}><Icon/><b>{t(name)}</b><small>{t("Tracked Service Order")}</small></button>)}</div>
      {live?<form className="liveServiceForm" onSubmit={async e=>{e.preventDefault();setServiceMessage("");try{await api.createGuestServiceOrder({reservationId:serviceBookingId,category:serviceCategory,title:(services.find(x=>x[2]===serviceCategory)?.[0]??"Service")+" request",details:serviceDetails},crypto.randomUUID());setServiceDetails("");setServiceMessage("Request created and routed to VIEWS staff.")}catch{setServiceMessage("Request not confirmed. Check with staff before submitting again.")}}}>
        <label>{t("Booking")}<select value={serviceBookingId} onChange={e=>setServiceBookingId(e.target.value)}>{liveBookings.map(b=><option key={b.id} value={b.id}>{b.confirmation_code} · {b.property_name}</option>)}</select></label>
        <label>{t("Details")}<textarea value={serviceDetails} onChange={e=>setServiceDetails(e.target.value)} placeholder={t("Tell us what you need…")}/></label>
        <button className="primary" disabled={!serviceBookingId||serviceDetails.trim().length<2}>{t("Send request")}</button>{serviceMessage&&<div className="notice">{t(serviceMessage)}</div>}
      </form>:<div className="serviceRequestMock"><label>{t("From")}<input value={t("Airport")} readOnly/></label><label>{t("To")}<input value={t("Apartment")} readOnly/></label><label>{t("Date")}<input type="date"/></label><label>{t("Time")}<input type="time"/></label><label className="full">{t("Comment")}<textarea placeholder={t("Add a note…")}/></label><button className="primary" disabled>{t("Create request unavailable in demo")}</button></div>}
    </section>}

    {tab==="messages"&&<section className="contentPage">
      <div className="sectionHead"><div><small>{t("CONCIERGE")}</small><h2>{t("Messages & requests")}</h2></div></div>
      <p className="notice">{t("Example conversation. No messages are sent.")}</p><div className="chatShell"><header><span className="conciergeDot"><ConciergeBell/></span><div><b>{t("VIEWS Concierge")}</b><small>{t("Online when staff/AI connector is available")}</small></div></header><div className="chatBody"><div className="bubble">{t("Hello. How can VIEWS help with your stay?")}</div><div className="bubble guest">{t("I need an airport transfer at 14:00.")}</div><div className="bubble">{t("Your request will be routed as a tracked Service Order.")}</div></div><footer><input aria-label={t("Message concierge")} placeholder={t("Messaging is not connected")} disabled/><button aria-label={t("Send message")} disabled><Send size={16}/></button></footer></div>
    </section>}

    {tab==="profile"&&<section className="contentPage">
      <div className="profileHero"><UserRound/><div><small>{t("VIEWS PROFILE")}</small><h2>{t("Guest profile")}</h2><p>{t("Payments use provider-hosted checkout. VIEWS never collects raw card details.")}</p></div></div>
      <div className="profileGrid">
        <button onClick={()=>document.getElementById("guest-notifications")?.focus()}><Bell/><b>{t("Notifications")}</b><small>{t('Updates: {count}',{count:alerts.length})}</small></button>
        <button onClick={()=>{setTab("explore");setView("list");setOnlyFavorites(true);}}><Heart/><b>{t("Favorites")}</b><small>{t('Saved: {count}',{count:favorites.length})}</small></button>
        <button disabled><Star/><b>{t("My reviews")}</b><small>{t("Not connected")}</small></button>
        <button disabled><CreditCard/><b>{t("Payment methods")}</b><small>{t("Not connected")}</small></button>
      </div>
      <section id="guest-notifications" tabIndex={-1} className="notificationPanel"><h3>{t("Notifications")}</h3>{alerts.map(a=><article key={a.id}><span className="notificationDot"/><div><b>{t(a.title)}</b><small>{t(a.detail)}</small></div></article>)}</section>
      <section className="helpPanel"><h3>{t('Help & support')}</h3><input aria-label={t('Search help…')} value={supportQuery} onChange={e=>setSupportQuery(e.target.value)} placeholder={t('Search help…')}/>
       <div className="helpLinks">{helpTopics.filter(([title,body])=>(t(title)+' '+t(body)).toLocaleLowerCase().includes(supportQuery.trim().toLocaleLowerCase())).map(([title,body])=><details key={title}><summary>{t(title)}</summary><p>{t(body)}</p></details>)}</div>
       {helpTopics.every(([title,body])=>!(t(title)+' '+t(body)).toLocaleLowerCase().includes(supportQuery.trim().toLocaleLowerCase()))&&<p role="status">{t('No help topics match your search.')}</p>}
      </section>
    </section>}

    <nav className="guestNav" aria-label={t("Guest sections")}>{[["explore",Search],["bookings",CalendarDays],["services",ConciergeBell],["messages",MessageCircle],["profile",UserRound]].map(([id,Icon])=><button className={tab===id?"active":""} aria-current={tab===id?"page":undefined} key={id as string} onClick={()=>setTab(id as Tab)}><Icon size={18}/><span>{t(tabLabels[id as Tab])}</span></button>)}</nav>

    {showSms&&<SmsUnavailableDialog onClose={()=>setShowSms(false)}/>}

    {selected&&<GuestDialog title={t(flowLabels[flow])} onClose={closeFlow} onBack={()=>flow==="apartment"?closeFlow():go(flow==="booking"?"apartment":flow==="guest-data"?"booking":flow==="payment"?"guest-data":"apartment")}>
      <p className="notice">{t("Preview only. These screens do not create bookings or process payments.")}</p>

      {flow==="apartment"&&<>
        <img className="modalPhoto" src={selected.image} alt={t(selected.title)}/><div className="sectionHead"><div><small>{selected.property}</small><h2>{t(selected.title)}</h2></div><strong>{selected.nightlyRate===null?t("Select dates for live rate"):selected.currency+" "+selected.nightlyRate}</strong></div>
        <div className="facts">{selected.amenities.map(x=><span key={x}>{t(x)}</span>)}</div><p className="modalCopy">{t("Demo apartment with illustrative photos. Real availability and prices are not connected.")}</p><button className="primary wide" onClick={()=>go("booking")}>{t("Choose dates")}</button>
      </>}

      {flow==="booking"&&<div className="flow"><h2>{t("Booking")}</h2><div className="two"><label>{t("Check-in")}<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>{t("Check-out")}<input type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div><label>{t("Guests")}<input type="number" value={guests} min={1} max={selected.capacity} onChange={e=>setGuests(Number(e.target.value)||1)}/></label><div className="extras"><label><input type="checkbox"/> {' '}{t("Airport transfer")}</label><label><input type="checkbox"/> {' '}{t("Cleaning")}</label><label><input type="checkbox"/> {' '}{t("Late check-out")}</label></div><div className="priceSummary"><span>{t("Stay")}</span><b>{quote?.total===null?t("Live total unavailable"):selected.currency+" "+quote?.total}</b><span>{t("Services")}</span><b>{t("Calculated when selected")}</b><span>{t("Total")}</span><strong>{quote?.total===null?"—":selected.currency+" "+quote?.total}</strong></div><button className="primary wide" disabled={!quote?.canContinue} onClick={()=>go("guest-data")}>{t("Continue")}</button></div>}

      {flow==="guest-data"&&<div className="flow"><h2>{t("Guest data")}</h2><label>{t("Full name")}<input placeholder={t("Primary guest")}/></label><label>{t("Date of birth")}<input type="date"/></label><label>{t("Nationality")}<select><option>{t("Uzbekistan")}</option><option>{t("Other")}</option></select></label><label>{t("Passport / ID")}<input placeholder={t("Secure upload required")} readOnly/></label><div className="notice">{t("Document upload remains disabled until encrypted file storage is connected.")}</div><button className="primary wide" onClick={()=>go("payment")}>{t("Continue")}</button></div>}

      {flow==="payment"&&<div className="flow"><h2>{t("Payment")}</h2><div className="providerRow"><button>Payme</button><button>Click</button><button>Uzum</button><button>{t("Bank card")}</button></div><div className="notice">{t("VIEWS never collects raw card details. Checkout opens on the payment provider/bank page.")}</div><button className="primary wide" disabled onClick={()=>go("secure-processing")}>{t("Continue to secure payment")}</button><button onClick={()=>go("payment-declined")}>{t("Preview declined state")}</button><button onClick={()=>go("booking-confirmed")}>{t("Preview confirmation state")}</button></div>}

      {flow==="secure-processing"&&<StateScreen icon={<CreditCard/>} title={t("Secure payment")} text={t("The bank/provider 3-D Secure page opens here. Timeout and back navigation are handled without marking payment successful.")}/>}
      {flow==="payment-declined"&&<StateScreen danger icon={<AlertCircle/>} title={t("Payment declined")} text={t("The bank declined the payment. No booking confirmation is issued. Try again or choose another payment method.")} action={t("Retry payment")} onAction={()=>go("payment")}/>}
      {flow==="booking-confirmed"&&<StateScreen success icon={<CheckCircle2/>} title={t("Confirmation screen preview")} text={t("Confirmation is shown only after a verified booking/payment response. Booking code and arrival instructions come from backend data.")} action={t("Booking details")} onAction={()=>go("booking-details")}/>}
      {flow==="booking-details"&&<div className="flow"><h2>{t("Booking details")}</h2><img className="bookingDetailPhoto" src={selected.image} alt={t(selected.title)}/><div className="detailRows"><span>{t("Property")}<b>{selected.property}</b></span><span>{t("Dates")}<b>{checkIn||t("Select date")} → {checkOut||t("Select date")}</b></span><span>{t("Access code")}<b>{t("Available after backend confirmation")}</b></span><span>{t("Address")}<b>{t("NRG U-Tower, Tashkent")}</b></span><span>{t("Documents")}<b>{t("Registration / check-in documents")}</b></span></div><button className="primary wide" onClick={()=>go("cancellation-refund")}>{t("Change / cancel booking")}</button></div>}
      {flow==="cancellation-refund"&&<div className="flow"><h2>{t("Cancellation & refund")}</h2><div className="policyTimeline"><span><b>{t("72+ hours")}</b>{t("Refund according to booked rate plan")}</span><span><b>{t("24–72 hours")}</b>{t("Partial refund if rate plan allows")}</span><span><b>{t("<24 hours")}</b>{t("Exact backend policy required")}</span></div><div className="refundBox"><span>{t("Refund calculation")}</span><strong>{t("Calculated from live booking policy")}</strong><small>{t("No amount is fabricated in staging.")}</small></div><button className="primary wide" disabled>{t("Confirm cancellation")}</button></div>}
    </GuestDialog>}
    {bookingDetails&&<GuestDialog title={t('Booking details')} onClose={()=>setBookingDetails(null)}>
      <div className="detailRows">
       <span>{t('Booking code')}<b>{bookingDetails.confirmation_code}</b></span>
       <span>{t('Property')}<b>{bookingDetails.property_name}</b></span>
       <span>{t('City')}<b>{bookingDetails.city}</b></span>
       <span>{t('Apartment')}<b>{bookingDetails.unit_code||t('Not assigned')}</b></span>
       <span>{t('Dates')}<b>{bookingDetails.check_in_date} → {bookingDetails.check_out_date}</b></span>
       <span>{t('Status')}<b>{t(bookingStatus(bookingDetails.status))}</b></span>
      </div><p className="notice">{t("Only details returned for this booking are shown. Access instructions and cancellation are not connected here.")}</p>
    </GuestDialog>}
  </main>
}

function StateScreen({icon,title,text,action,onAction,danger,success}:{icon:React.ReactNode;title:string;text:string;action?:string;onAction?:()=>void;danger?:boolean;success?:boolean}){
  const {t}=useGuestLocale();
  return <div className={"stateScreen "+(danger?"danger":"")+(success?" success":"")}><div className="stateIcon">{icon}</div><h2>{t(title)}</h2><p>{t(text)}</p>{action&&<button className="primary" onClick={onAction}>{t(action)}</button>}</div>
}
