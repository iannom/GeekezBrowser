// Comprehensive IANA Timezone list for dropdown
// Fix: Export to window for global access (module scope issue)
const TIMEZONES = [
    "Auto (No Change)",  // 不修改时区，用于需要访问登录页面的环境
    // --- North America ---
    "America/New_York",        // US Eastern
    "America/Chicago",         // US Central
    "America/Denver",          // US Mountain
    "America/Phoenix",         // Arizona (no DST)
    "America/Los_Angeles",     // US Pacific
    "America/Anchorage",       // Alaska
    "Pacific/Honolulu",        // 夏威夷
    "America/Toronto",         // Canada Eastern
    "America/Vancouver",       // Canada Pacific
    "America/Edmonton",        // Canada Mountain
    "America/Winnipeg",        // Canada Central
    "America/Halifax",         // Canada Atlantic
    "America/Mexico_City",     // Mexico
    "America/Tijuana",         // Mexico Pacific
    "America/Monterrey",       // Mexico Central

    // --- Central & South America ---
    "America/Guatemala",
    "America/Costa_Rica",
    "America/Panama",
    "America/Bogota",          // Colombia
    "America/Lima",            // Peru
    "America/Santiago",        // Chile
    "America/Buenos_Aires",    // Argentina
    "America/Sao_Paulo",       // Brazil
    "America/Caracas",         // Venezuela

    // --- Europe ---
    "Europe/London",           // UK
    "Europe/Dublin",           // Ireland
    "Europe/Paris",            // France
    "Europe/Berlin",           // Germany
    "Europe/Rome",             // Italy
    "Europe/Madrid",           // Spain
    "Europe/Lisbon",           // Portugal
    "Europe/Amsterdam",        // Netherlands
    "Europe/Brussels",         // Belgium
    "Europe/Vienna",           // Austria
    "Europe/Zurich",           // Switzerland
    "Europe/Stockholm",        // Sweden
    "Europe/Oslo",             // Norway
    "Europe/Copenhagen",       // Denmark
    "Europe/Helsinki",         // Finland
    "Europe/Warsaw",           // Poland
    "Europe/Prague",           // Czech Republic
    "Europe/Budapest",         // Hungary
    "Europe/Athens",           // Greece
    "Europe/Istanbul",         // Turkey
    "Europe/Moscow",           // Russia
    "Europe/Kyiv",             // Ukraine
    "Europe/Bucharest",        // Romania
    "Europe/Sofia",            // Bulgaria

    // --- Asia ---
    "Asia/Dubai",              // UAE
    "Asia/Riyadh",             // Saudi Arabia
    "Asia/Tehran",             // Iran
    "Asia/Karachi",            // Pakistan
    "Asia/Kolkata",            // India
    "Asia/Dhaka",              // Bangladesh
    "Asia/Kathmandu",          // Nepal
    "Asia/Bangkok",            // Thailand
    "Asia/Ho_Chi_Minh",        // Vietnam
    "Asia/Jakarta",            // Indonesia Western
    "Asia/Singapore",          // Singapore
    "Asia/Kuala_Lumpur",       // Malaysia
    "Asia/Manila",             // Philippines
    "Asia/Hong_Kong",          // Hong Kong
    "Asia/Shanghai",           // China
    "Asia/Taipei",             // Taiwan
    "Asia/Tokyo",              // Japan
    "Asia/Seoul",              // South Korea
    "Asia/Vladivostok",        // Russia East

    // --- Australia & Pacific ---
    "Australia/Perth",         // Western Australia
    "Australia/Darwin",        // Northern Territory
    "Australia/Adelaide",      // South Australia
    "Australia/Brisbane",      // Queensland
    "Australia/Sydney",        // New South Wales
    "Australia/Melbourne",     // Victoria
    "Australia/Hobart",        // Tasmania
    "Pacific/Auckland",        // New Zealand
    "Pacific/Fiji",
    "Pacific/Guam",
    "Pacific/Honolulu",        // 夏威夷（保留重复项便于搜索）

    // --- Africa ---
    "Africa/Cairo",            // Egypt
    "Africa/Johannesburg",     // South Africa
    "Africa/Lagos",            // Nigeria
    "Africa/Nairobi",          // Kenya
    "Africa/Casablanca",       // Morocco
    "Africa/Algiers",          // Algeria

    // --- Middle East ---
    "Asia/Jerusalem",          // Israel
    "Asia/Beirut",             // Lebanon
    "Asia/Damascus",           // Syria
    "Asia/Baghdad",            // Iraq
    "Asia/Kuwait",             // Kuwait
    "Asia/Qatar",              // Qatar
    "Asia/Muscat",             // Oman

    // --- 其他美国时区 ---
    "America/Detroit",         // Michigan
    "America/Indianapolis",    // Indiana
    "America/Louisville",      // Kentucky
    "America/Boise",           // Idaho
];

// Export for both CommonJS and browser global
if (typeof module !== "undefined" && module.exports) {
    module.exports = TIMEZONES;
}
// Fix: Ensure window.TIMEZONES is set even in module context
if (typeof window !== "undefined") {
    window.TIMEZONES = TIMEZONES;
}
