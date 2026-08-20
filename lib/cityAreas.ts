/* -------------------------------------------------------------------------- */
/*  TrendMart — Curated city areas (mohallas / colonies / towns)               */
/*                                                                             */
/*  Each area has an approximate pin so that selecting it moves the customer   */
/*  location there and the proximity engine (shops / products / deals) filters */
/*  everything around that ilaqa automatically.                                */
/*                                                                             */
/*  This is the platform's core mapping power: rich per-city area coverage     */
/*  means any customer in any supported city can pick their exact mohalla.     */
/* -------------------------------------------------------------------------- */

export interface CityArea {
  name: string;
  lat: number;
  lng: number;
}

export const CITY_AREAS: Record<string, CityArea[]> = {
  /* ── Gujranwala (hyper-local home turf — deepest coverage) ─────────────── */
  Gujranwala: [
    { name: "Peoples Colony", lat: 32.1818, lng: 74.204 },
    { name: "Satellite Town", lat: 32.163, lng: 74.19 },
    { name: "Model Town", lat: 32.168, lng: 74.177 },
    { name: "Gulberg", lat: 32.15, lng: 74.183 },
    { name: "Wapda Town", lat: 32.148, lng: 74.213 },
    { name: "Civil Lines", lat: 32.1905, lng: 74.208 },
    { name: "Faisal Town", lat: 32.195, lng: 74.185 },
    { name: "Allama Iqbal Town", lat: 32.2005, lng: 74.171 },
    { name: "Awan Town", lat: 32.206, lng: 74.177 },
    { name: "Ghakar Mandi", lat: 32.187, lng: 74.1835 },
    { name: "Rahwali", lat: 32.227, lng: 74.249 },
    { name: "Daska Road", lat: 32.168, lng: 74.24 },
    { name: "Shalimar Town", lat: 32.176, lng: 74.187 },
    { name: "Quaid-e-Azam Town", lat: 32.157, lng: 74.172 },
    { name: "Jinnah Town", lat: 32.208, lng: 74.19 },
    { name: "Kashmir Colony", lat: 32.193, lng: 74.196 },
    { name: "Rasheed Colony", lat: 32.178, lng: 74.195 },
    { name: "Islamia Park", lat: 32.183, lng: 74.189 },
    { name: "Shehbaz Pura", lat: 32.196, lng: 74.201 },
    { name: "Tajpura", lat: 32.191, lng: 74.214 },
    { name: "Kachehri Chowk", lat: 32.1875, lng: 74.193 },
    { name: "GT Road", lat: 32.187, lng: 74.199 },
    { name: "Circular Road", lat: 32.185, lng: 74.191 },
    { name: "Hospital Road", lat: 32.1875, lng: 74.197 },
    { name: "Sargodha Road", lat: 32.18, lng: 74.172 },
    { name: "Baba Fareed Road", lat: 32.174, lng: 74.184 },
    { name: "Wazirabad Road", lat: 32.202, lng: 74.211 },
    { name: "University Road", lat: 32.198, lng: 74.204 },
    { name: "Zafarwal Road", lat: 32.173, lng: 74.229 },
    { name: "Ganda Nala Road", lat: 32.181, lng: 74.198 },
    { name: "Chabba Chowk", lat: 32.174, lng: 74.202 },
    { name: "Bhatta Chowk", lat: 32.192, lng: 74.201 },
    { name: "Muslim Town", lat: 32.177, lng: 74.181 },
    { name: "Shaheen Town", lat: 32.17, lng: 74.196 },
    { name: "Mustafa Town", lat: 32.155, lng: 74.19 },
    { name: "Al-Falah Town", lat: 32.162, lng: 74.198 },
    { name: "Takht Hazara", lat: 32.143, lng: 74.243 },
    { name: "Kamonki", lat: 32.124, lng: 74.226 },
    { name: "Nandipur", lat: 32.13, lng: 74.165 },
    { name: "Kot Waris", lat: 32.207, lng: 74.253 },
    { name: "Mohlanwal", lat: 32.23, lng: 74.265 },
    { name: "Eminabad", lat: 32.259, lng: 74.222 },
    { name: "Khiali Shahpur", lat: 32.22, lng: 74.17 },
    { name: "Ahmad Nagar", lat: 32.16, lng: 74.222 },
    { name: "Farooqabad", lat: 32.102, lng: 74.23 },
    { name: "Gujranwala Cantt", lat: 32.167, lng: 74.228 },
  ],

  /* ── Lahore ────────────────────────────────────────────────────────────── */
  Lahore: [
    { name: "Gulberg", lat: 31.5204, lng: 74.3587 },
    { name: "Model Town", lat: 31.4795, lng: 74.323 },
    { name: "DHA", lat: 31.4707, lng: 74.4073 },
    { name: "Johar Town", lat: 31.4697, lng: 74.255 },
    { name: "Wapda Town", lat: 31.447, lng: 74.285 },
    { name: "Township", lat: 31.507, lng: 74.307 },
    { name: "Iqbal Town", lat: 31.53, lng: 74.26 },
    { name: "Garden Town", lat: 31.51, lng: 74.32 },
    { name: "Faisal Town", lat: 31.47, lng: 74.3 },
    { name: "Valencia", lat: 31.49, lng: 74.28 },
    { name: "Cavalry Ground", lat: 31.516, lng: 74.337 },
    { name: "Bahria Town", lat: 31.357, lng: 74.21 },
    { name: "Samanabad", lat: 31.46, lng: 74.26 },
    { name: "Allama Iqbal Town", lat: 31.518, lng: 74.245 },
    { name: "Nishtar Colony", lat: 31.476, lng: 74.333 },
    { name: "Punjab Co-operative Housing Society", lat: 31.517, lng: 74.375 },
    { name: "LDA Avenue", lat: 31.36, lng: 74.26 },
    { name: "Raiwind Road", lat: 31.33, lng: 74.29 },
    { name: "Canal Road", lat: 31.49, lng: 74.34 },
    { name: "Shadman", lat: 31.531, lng: 74.344 },
    { name: "Liberty Market", lat: 31.518, lng: 74.34 },
    { name: "MM Alam Road", lat: 31.514, lng: 74.351 },
    { name: "Kareem Block", lat: 31.5, lng: 74.34 },
    { name: "Faletti's / Mall Road", lat: 31.559, lng: 74.323 },
    { name: "Anarkali", lat: 31.561, lng: 74.314 },
    { name: "Mozang", lat: 31.545, lng: 74.31 },
    { name: "Data Darbar", lat: 31.571, lng: 74.309 },
    { name: "Gawalmandi", lat: 31.575, lng: 74.318 },
    { name: "Bhati Gate", lat: 31.568, lng: 74.313 },
    { name: "Ichhra", lat: 31.548, lng: 74.296 },
    { name: "Mustafa Town", lat: 31.45, lng: 74.29 },
    { name: "Thokar Niaz Baig", lat: 31.439, lng: 74.253 },
    { name: "Sabzazar", lat: 31.42, lng: 74.27 },
    { name: "Shahdara", lat: 31.61, lng: 74.29 },
    { name: "Wahdat Road", lat: 31.52, lng: 74.29 },
    { name: "Main Boulevard", lat: 31.5, lng: 74.35 },
    { name: "Bedian Road", lat: 31.47, lng: 74.39 },
    { name: "DHA Phase 6", lat: 31.487, lng: 74.403 },
    { name: "Askari 11", lat: 31.47, lng: 74.32 },
    { name: "EME Society", lat: 31.496, lng: 74.383 },
  ],

  /* ── Islamabad ─────────────────────────────────────────────────────────── */
  Islamabad: [
    { name: "F-6", lat: 33.7, lng: 73.045 },
    { name: "F-7", lat: 33.693, lng: 73.035 },
    { name: "F-8", lat: 33.682, lng: 73.022 },
    { name: "F-10", lat: 33.697, lng: 73.01 },
    { name: "F-11", lat: 33.695, lng: 72.997 },
    { name: "E-7", lat: 33.694, lng: 73.053 },
    { name: "E-8", lat: 33.684, lng: 73.064 },
    { name: "G-6", lat: 33.678, lng: 73.057 },
    { name: "G-7", lat: 33.669, lng: 73.047 },
    { name: "G-8", lat: 33.665, lng: 73.035 },
    { name: "G-9", lat: 33.658, lng: 73.04 },
    { name: "G-10", lat: 33.656, lng: 73.011 },
    { name: "G-11", lat: 33.651, lng: 72.977 },
    { name: "G-13", lat: 33.63, lng: 72.98 },
    { name: "I-8", lat: 33.664, lng: 72.99 },
    { name: "I-9", lat: 33.663, lng: 72.976 },
    { name: "I-10", lat: 33.66, lng: 72.956 },
    { name: "Blue Area", lat: 33.715, lng: 73.061 },
    { name: "Saidpur", lat: 33.741, lng: 73.051 },
    { name: "Bani Gala", lat: 33.71, lng: 73.1 },
    { name: "Bahria Enclave", lat: 33.47, lng: 73.11 },
    { name: "DHA Islamabad", lat: 33.542, lng: 73.155 },
    { name: "Bahria Town", lat: 33.52, lng: 73.11 },
    { name: "Navy Housing", lat: 33.57, lng: 73.18 },
    { name: "Golra", lat: 33.636, lng: 72.94 },
    { name: "Sihala", lat: 33.49, lng: 73.07 },
    { name: "PWD", lat: 33.57, lng: 73.14 },
    { name: "G-14", lat: 33.63, lng: 72.96 },
    { name: "F-5", lat: 33.705, lng: 73.055 },
    { name: "F-12", lat: 33.69, lng: 72.98 },
  ],

  /* ── Rawalpindi ────────────────────────────────────────────────────────── */
  Rawalpindi: [
    { name: "Satellite Town", lat: 33.61, lng: 73.055 },
    { name: "Bahria Town", lat: 33.59, lng: 73.115 },
    { name: "Gulraiz", lat: 33.646, lng: 73.039 },
    { name: "Chaklala", lat: 33.548, lng: 73.056 },
    { name: "Westridge", lat: 33.595, lng: 73.09 },
    { name: "Peshawar Road", lat: 33.63, lng: 73.045 },
    { name: "Tench Bhatta", lat: 33.575, lng: 73.03 },
    { name: "Committee Chowk", lat: 33.597, lng: 73.045 },
    { name: "Lalazar", lat: 33.6, lng: 73.04 },
    { name: "Saddar", lat: 33.596, lng: 73.058 },
    { name: "Shamsabad", lat: 33.613, lng: 73.03 },
    { name: "Chandni Chowk", lat: 33.61, lng: 73.02 },
    { name: "Gulgasht Colony", lat: 33.585, lng: 73.06 },
    { name: "Morgan", lat: 33.555, lng: 73.17 },
    { name: "Adyala Road", lat: 33.56, lng: 73.06 },
    { name: "Airport Road", lat: 33.55, lng: 73.05 },
    { name: "Muslim Town", lat: 33.62, lng: 73.07 },
    { name: "DHA Phase 1", lat: 33.555, lng: 73.11 },
    { name: "DHA Phase 2", lat: 33.537, lng: 73.15 },
    { name: "6th Road", lat: 33.62, lng: 73.04 },
  ],

  /* ── Faisalabad ────────────────────────────────────────────────────────── */
  Faisalabad: [
    { name: "D Ground", lat: 31.415, lng: 73.065 },
    { name: "Peoples Colony", lat: 31.432, lng: 73.098 },
    { name: "Madina Town", lat: 31.408, lng: 73.12 },
    { name: "Satellite Town", lat: 31.398, lng: 73.05 },
    { name: "Gulberg", lat: 31.375, lng: 73.07 },
    { name: "Canal Road", lat: 31.438, lng: 73.07 },
    { name: "Ghulam Muhammad Abad", lat: 31.445, lng: 73.11 },
    { name: "Liaquatabad", lat: 31.415, lng: 73.09 },
    { name: "Amin Town", lat: 31.44, lng: 73.055 },
    { name: "Jaranwala Road", lat: 31.39, lng: 73.14 },
    { name: "Sargodha Road", lat: 31.44, lng: 73.05 },
    { name: "Samundri Road", lat: 31.4, lng: 73.08 },
    { name: "Narwala Road", lat: 31.42, lng: 73.13 },
    { name: "Eidgah", lat: 31.423, lng: 73.076 },
    { name: "Bhowana Bazar", lat: 31.417, lng: 73.07 },
    { name: "Kohinoor Town", lat: 31.383, lng: 73.065 },
    { name: "Askari Colony", lat: 31.43, lng: 73.045 },
    { name: "Batala Colony", lat: 31.45, lng: 73.1 },
    { name: "Gulistan Colony", lat: 31.42, lng: 73.1 },
    { name: "Jinnah Colony", lat: 31.41, lng: 73.06 },
  ],

  /* ── Karachi ───────────────────────────────────────────────────────────── */
  Karachi: [
    { name: "Gulshan-e-Iqbal", lat: 24.912, lng: 67.098 },
    { name: "Gulistan-e-Johar", lat: 24.913, lng: 67.132 },
    { name: "North Nazimabad", lat: 24.95, lng: 67.035 },
    { name: "Nazimabad", lat: 24.923, lng: 67.03 },
    { name: "Saddar", lat: 24.854, lng: 67.028 },
    { name: "Clifton", lat: 24.818, lng: 67.028 },
    { name: "DHA", lat: 24.793, lng: 67.039 },
    { name: "Korangi", lat: 24.82, lng: 67.14 },
    { name: "Malir", lat: 24.888, lng: 67.19 },
    { name: "PECHS", lat: 24.882, lng: 67.066 },
    { name: "Tariq Road", lat: 24.886, lng: 67.078 },
    { name: "Bahadurabad", lat: 24.89, lng: 67.072 },
    { name: "Jamshed Town", lat: 24.9, lng: 67.045 },
    { name: "Gulshan-e-Maymar", lat: 25.001, lng: 67.141 },
    { name: "Federal B Area", lat: 24.9, lng: 67.06 },
    { name: "Liaquatabad", lat: 24.918, lng: 67.03 },
    { name: "F.B. Area Block 6", lat: 24.897, lng: 67.062 },
    { name: "Nipa Chowrangi", lat: 24.92, lng: 67.085 },
    { name: "Askari", lat: 24.836, lng: 67.1 },
    { name: "University Road", lat: 24.93, lng: 67.11 },
    { name: "Shah Faisal Colony", lat: 24.87, lng: 67.16 },
    { name: "Landhi", lat: 24.86, lng: 67.22 },
    { name: "Qaidabad", lat: 24.85, lng: 67.16 },
    { name: "Gulshan-e-Hadeed", lat: 24.82, lng: 67.28 },
    { name: "Steel Town", lat: 24.78, lng: 67.3 },
    { name: "Orangi Town", lat: 24.955, lng: 67.0 },
    { name: "Kharadar", lat: 24.847, lng: 66.993 },
    { name: "Bohra Pir", lat: 24.86, lng: 66.99 },
    { name: "Defence Phase 2", lat: 24.804, lng: 67.062 },
    { name: "Sea View", lat: 24.787, lng: 67.013 },
  ],

  /* ── Multan ────────────────────────────────────────────────────────────── */
  Multan: [
    { name: "Gulgasht", lat: 30.185, lng: 71.473 },
    { name: "Shah Rukn-e-Alam", lat: 30.187, lng: 71.482 },
    { name: "Mumtazabad", lat: 30.213, lng: 71.48 },
    { name: "Qasim Town", lat: 30.17, lng: 71.54 },
    { name: "Basti Malook", lat: 30.228, lng: 71.483 },
    { name: "New Multan", lat: 30.17, lng: 71.47 },
    { name: "Nishtar Town", lat: 30.178, lng: 71.493 },
    { name: "Jalalpur Pirwala", lat: 30.05, lng: 71.62 },
    { name: "Bosan Road", lat: 30.17, lng: 71.49 },
    { name: "Qadirpur Raan", lat: 30.23, lng: 71.55 },
    { name: "Vehari Road", lat: 30.16, lng: 71.52 },
    { name: "Shujabad Road", lat: 30.16, lng: 71.45 },
  ],

  /* ── Sialkot ───────────────────────────────────────────────────────────── */
  Sialkot: [
    { name: "Model Town", lat: 32.505, lng: 74.542 },
    { name: "Satellite Town", lat: 32.515, lng: 74.53 },
    { name: "Gohadpur", lat: 32.48, lng: 74.545 },
    { name: "Sialkot Cantt", lat: 32.478, lng: 74.56 },
    { name: "Ahmad Pura", lat: 32.51, lng: 74.52 },
    { name: "Iqbal Town", lat: 32.5, lng: 74.55 },
    { name: "Jinnah Park", lat: 32.495, lng: 74.535 },
    { name: "Shahab Pura", lat: 32.49, lng: 74.51 },
    { name: "Khanda Colony", lat: 32.52, lng: 74.54 },
    { name: "Daska Road", lat: 32.47, lng: 74.56 },
    { name: "Wazirabad Road", lat: 32.53, lng: 74.53 },
    { name: "Marala Road", lat: 32.49, lng: 74.55 },
  ],

  /* ── Gujrat ────────────────────────────────────────────────────────────── */
  Gujrat: [
    { name: "Guliana", lat: 32.59, lng: 74.09 },
    { name: "Jalalpur Jattan", lat: 32.64, lng: 74.2 },
    { name: "Kharian Road", lat: 32.61, lng: 74.07 },
    { name: "GT Road", lat: 32.575, lng: 74.085 },
    { name: "Mission Road", lat: 32.578, lng: 74.075 },
    { name: "Sargodha Road", lat: 32.58, lng: 74.06 },
    { name: "Satellite Town", lat: 32.593, lng: 74.065 },
    { name: "Model Town", lat: 32.587, lng: 74.078 },
    { name: "Rehmania Town", lat: 32.585, lng: 74.095 },
    { name: "Nandpur", lat: 32.57, lng: 74.1 },
    { name: "Bharat Chowk", lat: 32.576, lng: 74.08 },
    { name: "Kunjah", lat: 32.5, lng: 73.97 },
  ],

  /* ── Wazirabad ─────────────────────────────────────────────────────────── */
  Wazirabad: [
    { name: "GT Road", lat: 32.443, lng: 74.115 },
    { name: "Rasool Nagar", lat: 32.43, lng: 74.09 },
    { name: "Nagana", lat: 32.47, lng: 74.14 },
    { name: "Wazirabad City", lat: 32.443, lng: 74.113 },
    { name: "Sodhra", lat: 32.5, lng: 74.12 },
    { name: "Manga", lat: 32.45, lng: 74.1 },
    { name: "Bharat Chowk", lat: 32.446, lng: 74.11 },
  ],

  /* ── Hafizabad ─────────────────────────────────────────────────────────── */
  Hafizabad: [
    { name: "Main Bazar", lat: 32.068, lng: 73.689 },
    { name: "Kot Ismail", lat: 32.1, lng: 73.69 },
    { name: "Jalalpur Bhattian", lat: 32.07, lng: 73.75 },
    { name: "Hafizabad City", lat: 32.067, lng: 73.688 },
    { name: "Sukhikey", lat: 32.05, lng: 73.71 },
    { name: "Vanike Tarar", lat: 32.08, lng: 73.62 },
  ],

  /* ── Daska ─────────────────────────────────────────────────────────────── */
  Daska: [
    { name: "Daska City", lat: 32.33, lng: 74.35 },
    { name: "Gohadpur Road", lat: 32.34, lng: 74.37 },
    { name: "Adda Daska", lat: 32.332, lng: 74.348 },
    { name: "Bajra Garh", lat: 32.3, lng: 74.4 },
    { name: "Daska Sialkot Road", lat: 32.33, lng: 74.36 },
  ],

  /* ── Kamoke ────────────────────────────────────────────────────────────── */
  Kamoke: [
    { name: "Kamoke Bazar", lat: 31.976, lng: 74.222 },
    { name: "Sattowal", lat: 31.99, lng: 74.24 },
    { name: "Kamoke City", lat: 31.976, lng: 74.223 },
    { name: "Rajanpur Road", lat: 31.98, lng: 74.2 },
  ],

  /* ── Nowshera Virkan ───────────────────────────────────────────────────── */
  "Nowshera Virkan": [
    { name: "Nowshera Virkan", lat: 31.96, lng: 73.97 },
    { name: "Chowk Mirza", lat: 31.95, lng: 73.98 },
  ],

  /* ── Jehlum ────────────────────────────────────────────────────────────── */
  Jehlum: [
    { name: "Model Town", lat: 32.955, lng: 73.735 },
    { name: "Kala Gujran", lat: 32.94, lng: 73.74 },
    { name: "Jhelum Cantt", lat: 32.92, lng: 73.72 },
    { name: "G.T. Road", lat: 32.945, lng: 73.73 },
    { name: "Dina", lat: 32.87, lng: 73.67 },
    { name: "Sara-e-Alamgir", lat: 32.86, lng: 73.72 },
  ],

  /* ── Narowal ───────────────────────────────────────────────────────────── */
  Narowal: [
    { name: "Narowal City", lat: 32.1, lng: 74.88 },
    { name: "Shakargarh", lat: 32.26, lng: 75.15 },
    { name: "Zafarwal", lat: 32.34, lng: 74.93 },
    { name: "Bajwat", lat: 32.08, lng: 74.94 },
  ],

  /* ── Sheikhupura ───────────────────────────────────────────────────────── */
  Sheikhupura: [
    { name: "Sheikhupura City", lat: 31.716, lng: 73.985 },
    { name: "Muridke", lat: 31.8, lng: 74.03 },
    { name: "Farooqabad", lat: 31.72, lng: 74.12 },
    { name: "Safdarabad", lat: 31.77, lng: 73.87 },
    { name: "Ferozewala", lat: 31.62, lng: 74.04 },
    { name: "Kot Abdul Malik", lat: 31.62, lng: 74.12 },
    { name: "Mian Pindi", lat: 31.65, lng: 73.95 },
  ],

  /* ── Peshawar ──────────────────────────────────────────────────────────── */
  Peshawar: [
    { name: "Hayatabad", lat: 33.988, lng: 71.437 },
    { name: "University Town", lat: 34.01, lng: 71.48 },
    { name: "Peshawar Cantt", lat: 34.0, lng: 71.54 },
    { name: "Ring Road", lat: 34.02, lng: 71.57 },
    { name: "Gulbahar", lat: 34.015, lng: 71.56 },
    { name: "Kohat Road", lat: 33.99, lng: 71.49 },
    { name: "Dabgari Gardens", lat: 34.0, lng: 71.5 },
    { name: "Saddar", lat: 34.0, lng: 71.53 },
    { name: "Board Bazar", lat: 34.0, lng: 71.52 },
    { name: "Yakatoot", lat: 34.01, lng: 71.5 },
    { name: "Acheni Payan", lat: 34.0, lng: 71.52 },
    { name: "Charsadda Road", lat: 34.02, lng: 71.56 },
  ],

  /* ── Quetta ────────────────────────────────────────────────────────────── */
  Quetta: [
    { name: "Satellite Town", lat: 30.185, lng: 66.995 },
    { name: "Samungli Road", lat: 30.19, lng: 66.99 },
    { name: "Jinnah Town", lat: 30.17, lng: 66.97 },
    { name: "Airport Road", lat: 30.19, lng: 66.94 },
    { name: "Hanna", lat: 30.27, lng: 67.06 },
    { name: "Brewery Road", lat: 30.19, lng: 67.01 },
    { name: "Circular Road", lat: 30.18, lng: 67.0 },
    { name: "Pashtoonabad", lat: 30.15, lng: 66.99 },
    { name: "Chiltan Housing", lat: 30.2, lng: 66.98 },
  ],

  /* ── Hyderabad ─────────────────────────────────────────────────────────── */
  Hyderabad: [
    { name: "Latifabad", lat: 25.416, lng: 68.368 },
    { name: "Qasimabad", lat: 25.38, lng: 68.34 },
    { name: "Unit 1-9", lat: 25.4, lng: 68.36 },
    { name: "City Market", lat: 25.38, lng: 68.37 },
    { name: "Saddar", lat: 25.385, lng: 68.375 },
    { name: "Autobhan Road", lat: 25.42, lng: 68.36 },
    { name: "Hyderabad Cantt", lat: 25.4, lng: 68.38 },
    { name: "Gulistan-e-Sajjad", lat: 25.37, lng: 68.33 },
    { name: "Tando Jam", lat: 25.42, lng: 68.54 },
    { name: "Kotri", lat: 25.37, lng: 68.31 },
  ],

  /* ── Bahawalpur ────────────────────────────────────────────────────────── */
  Bahawalpur: [
    { name: "Model Town", lat: 29.395, lng: 71.69 },
    { name: "Satellite Town", lat: 29.405, lng: 71.67 },
    { name: "Bahawalpur Cantt", lat: 29.38, lng: 71.67 },
    { name: "Fateh Basti", lat: 29.4, lng: 71.71 },
    { name: "Khanewal Road", lat: 29.39, lng: 71.68 },
    { name: "Multyat Road", lat: 29.41, lng: 71.66 },
    { name: "Chak Bedi", lat: 29.42, lng: 71.72 },
    { name: "Ahmadpur East", lat: 29.14, lng: 71.26 },
    { name: "Hasilpur", lat: 29.71, lng: 72.55 },
  ],

  /* ── Sargodha ──────────────────────────────────────────────────────────── */
  Sargodha: [
    { name: "Satellite Town", lat: 32.08, lng: 72.68 },
    { name: "40 Pull", lat: 32.1, lng: 72.67 },
    { name: "Kacheri Chowk", lat: 32.08, lng: 72.67 },
    { name: "Main Bazaar", lat: 32.086, lng: 72.671 },
    { name: "University Road", lat: 32.09, lng: 72.68 },
    { name: "Faisalabad Road", lat: 32.07, lng: 72.7 },
    { name: "Khan Colony", lat: 32.075, lng: 72.675 },
    { name: "Airport Road", lat: 32.05, lng: 72.66 },
    { name: "Bhalwal", lat: 32.27, lng: 72.91 },
  ],

  /* ── Sukkur ────────────────────────────────────────────────────────────── */
  Sukkur: [
    { name: "Sukkur City", lat: 27.705, lng: 68.857 },
    { name: "Old Sukkur", lat: 27.7, lng: 68.86 },
    { name: "Sukkur Bypass", lat: 27.7, lng: 68.88 },
    { name: "Lab-e-Darya", lat: 27.71, lng: 68.85 },
    { name: "Rohri", lat: 27.65, lng: 68.89 },
  ],

  /* ── Abbottabad ────────────────────────────────────────────────────────── */
  Abbottabad: [
    { name: "Mandian", lat: 34.17, lng: 73.24 },
    { name: "Banda Piran", lat: 34.19, lng: 73.21 },
    { name: "Malkot", lat: 34.15, lng: 73.21 },
    { name: "Nawan Shehr", lat: 34.16, lng: 73.22 },
    { name: "Sarban", lat: 34.16, lng: 73.19 },
    { name: "Havelian", lat: 34.05, lng: 73.16 },
    { name: "Mansehra Road", lat: 34.2, lng: 73.25 },
  ],

  /* ── Mardan ────────────────────────────────────────────────────────────── */
  Mardan: [
    { name: "Mardan City", lat: 34.199, lng: 72.023 },
    { name: "Takht Bhai", lat: 34.12, lng: 71.93 },
    { name: "Katlang", lat: 34.36, lng: 72.07 },
    { name: "Par Hoti", lat: 34.21, lng: 72.03 },
    { name: "Baghdada", lat: 34.22, lng: 72.03 },
    { name: "Rustam", lat: 34.31, lng: 72.05 },
    { name: "Sher Garh", lat: 34.22, lng: 72.08 },
  ],
};

/** Areas for a city, or an empty array when the city has no curated list. */
export function getCityAreas(city: string | null | undefined): CityArea[] {
  if (!city) return [];
  return CITY_AREAS[city] ?? [];
}

/** Find an exact area by name inside a city (normalized lookup). */
export function findAreaInCity(
  city: string | null | undefined,
  areaName: string,
): CityArea | null {
  const areas = getCityAreas(city);
  const target = normalizeAreaName(areaName);
  return areas.find((a) => normalizeAreaName(a.name) === target) ?? null;
}

/**
 * Normalize an area/colony name so "Peoples Colony" matches "People's Colony"
 * and "peoples  coloney" — strips punctuation, collapses spaces, lowercases.
 */
export function normalizeAreaName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
