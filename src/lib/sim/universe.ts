/**
 * Where the simulator starts you off: the main Indian indices and a list of large, actively traded NSE
 * companies. Only the symbols live here; every price, change and chart comes from the market data feed.
 * Symbols that stop trading simply don't show (no price comes back for them). Search finds any other
 * NSE or BSE stock.
 */
export const INDICES: { symbol: string; name: string }[] = [
  { symbol: "^NSEI", name: "Nifty 50" },
  { symbol: "^BSESN", name: "Sensex" },
  { symbol: "^NSEBANK", name: "Bank Nifty" },
  { symbol: "^CNXIT", name: "Nifty IT" },
];

export const LARGE_CAPS: { symbol: string; name: string; sector: string }[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Banks" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Banks" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "INFY.NS", name: "Infosys", sector: "IT" },
  { symbol: "SBIN.NS", name: "State Bank of India", sector: "Banks" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Infra" },
  { symbol: "ITC.NS", name: "ITC", sector: "FMCG" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Banks" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Banks" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra", sector: "Auto" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharma", sector: "Pharma" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies", sector: "IT" },
  { symbol: "NTPC.NS", name: "NTPC", sector: "Power" },
  { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer" },
  { symbol: "POWERGRID.NS", name: "Power Grid", sector: "Power" },
  { symbol: "ONGC.NS", name: "ONGC", sector: "Energy" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv", sector: "Finance" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Metals" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel", sector: "Metals" },
  { symbol: "HINDALCO.NS", name: "Hindalco", sector: "Metals" },
  { symbol: "COALINDIA.NS", name: "Coal India", sector: "Energy" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports", sector: "Infra" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Infra" },
  { symbol: "WIPRO.NS", name: "Wipro", sector: "IT" },
  { symbol: "TECHM.NS", name: "Tech Mahindra", sector: "IT" },
  { symbol: "NESTLEIND.NS", name: "Nestlé India", sector: "FMCG" },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto", sector: "Auto" },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors", sector: "Auto" },
  { symbol: "GRASIM.NS", name: "Grasim", sector: "Cement" },
  { symbol: "CIPLA.NS", name: "Cipla", sector: "Pharma" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's", sector: "Pharma" },
  { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals", sector: "Pharma" },
  { symbol: "BEL.NS", name: "Bharat Electronics", sector: "Defence" },
  { symbol: "TRENT.NS", name: "Trent", sector: "Consumer" },
  { symbol: "ETERNAL.NS", name: "Eternal (Zomato)", sector: "Consumer" },
  { symbol: "JIOFIN.NS", name: "Jio Financial", sector: "Finance" },
  { symbol: "SHRIRAMFIN.NS", name: "Shriram Finance", sector: "Finance" },
  { symbol: "HDFCLIFE.NS", name: "HDFC Life", sector: "Insurance" },
  { symbol: "SBILIFE.NS", name: "SBI Life", sector: "Insurance" },
  { symbol: "TATACONSUM.NS", name: "Tata Consumer", sector: "FMCG" },
  { symbol: "INDIGO.NS", name: "InterGlobe Aviation", sector: "Aviation" },
  { symbol: "HAL.NS", name: "Hindustan Aeronautics", sector: "Defence" },
  { symbol: "DMART.NS", name: "Avenue Supermarts", sector: "Consumer" },
];

/** "RELIANCE.NS" → "RELIANCE"; "500325.BO" → "500325". */
export const ticker = (symbol: string) => symbol.replace(/\.(NS|BO)$/, "").replace(/^\^/, "");
export const exchangeOf = (symbol: string) => (symbol.startsWith("^") ? "Index" : symbol.endsWith(".BO") ? "BSE" : "NSE");
