/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function EmulationApp() {
  let nextRequestId = 1;
  const send = (method: string, params: unknown, id?: number) =>
    (window.parent).postMessage({ jsonrpc: '2.0', method, params, id }, '*');

  const sendResponse = (id: number | string, result: unknown) =>
    (window.parent).postMessage({ jsonrpc: '2.0', id, result }, '*');

  const initializeRequestId = nextRequestId++;
  send('ui/initialize', {}, initializeRequestId);

  interface Viewport {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
    isLandscape: boolean;
  }

  interface Device {
    name: string;
    width: number;
    height: number;
    dpr: number;
    brand: 'apple' | 'google' | 'samsung' | 'microsoft' | 'asus' | 'default';
    type: 'mobile' | 'tablet' | 'desktop';
    notes?: string;
  }

  const DEVICES: Device[] = [
    // Mobile - Apple
    { name: 'iPhone SE', width: 320, height: 568, dpr: 2.0, brand: 'apple', type: 'mobile' },
    { name: 'iPhone XR', width: 414, height: 896, dpr: 2.0, brand: 'apple', type: 'mobile' },
    { name: 'iPhone 12 Pro', width: 390, height: 844, dpr: 3.0, brand: 'apple', type: 'mobile' },
    { name: 'iPhone 14 Pro Max', width: 430, height: 932, dpr: 3.0, brand: 'apple', type: 'mobile' },
    // Mobile - Google
    { name: 'Pixel 7', width: 412, height: 915, dpr: 2.625, brand: 'google', type: 'mobile' },
    // Mobile - Samsung
    { name: 'Samsung Galaxy S8+', width: 360, height: 740, dpr: 4.0, brand: 'samsung', type: 'mobile' },
    { name: 'Samsung Galaxy S20 Ultra', width: 412, height: 915, dpr: 2.625, brand: 'samsung', type: 'mobile' },
    { name: 'Samsung Galaxy A51/71', width: 412, height: 914, dpr: 2.625, brand: 'samsung', type: 'mobile' },

    // Tablet - Apple
    { name: 'iPad Mini', width: 768, height: 1024, dpr: 2.0, brand: 'apple', type: 'tablet', notes: 'Standard 4:3' },
    { name: 'iPad Air', width: 820, height: 1180, dpr: 2.0, brand: 'apple', type: 'tablet', notes: 'Modern Air' },
    { name: 'iPad Pro', width: 1024, height: 1366, dpr: 2.0, brand: 'apple', type: 'tablet', notes: '12.9-inch' },
    // Tablet - Microsoft
    { name: 'Surface Pro 7', width: 912, height: 1368, dpr: 2.0, brand: 'microsoft', type: 'tablet' },
    { name: 'Surface Duo', width: 540, height: 720, dpr: 2.5, brand: 'microsoft', type: 'tablet', notes: 'Single screen' },
    // Tablet - Samsung
    { name: 'Galaxy Z Fold 5', width: 344, height: 882, dpr: 2.625, brand: 'samsung', type: 'tablet', notes: 'Cover screen' },
    // Tablet - Asus
    { name: 'Asus Zenbook Fold', width: 853, height: 1280, dpr: 1.25, brand: 'asus', type: 'tablet', notes: 'Hybrid' },

    // Desktop
    { name: '1920 x 1080', width: 1920, height: 1080, dpr: 1.0, brand: 'default', type: 'desktop' },
    { name: '1440 x 900', width: 1440, height: 900, dpr: 1.0, brand: 'default', type: 'desktop' },
    { name: '1366 x 768', width: 1366, height: 768, dpr: 1.0, brand: 'default', type: 'desktop' },
    { name: '1280 x 800', width: 1280, height: 800, dpr: 1.0, brand: 'default', type: 'desktop' },
  ];

  const BRAND_ICONS: Record<string, string> = {
    apple: '<path d="M17.04 11.28c.07-1.74 1.54-2.57 1.61-2.61-.88-1.22-2.25-1.39-2.73-1.41-1.15-.11-2.26.63-2.85.63-.59 0-1.5-.62-2.47-.6-1.27.02-2.45.7-3.1 1.76-1.33 2.16-.34 5.37.94 7.13.63.86 1.37 1.83 2.35 1.79.94-.04 1.29-.56 2.42-.56 1.13 0 1.45.56 2.44.54.99-.02 1.63-.82 2.24-1.72.7-1.02.99-2.02 1-2.07-.02-.01-1.92-.69-1.85-2.88zM14.96 4.67c.52-.6 1.04-1.21.92-2.17-1.01.04-2.23.63-2.95 1.4-.46.49-.86 1.26-.74 2.14 1.12.08 2.26-.76 2.77-1.37z"/>',
    google: '<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 0.307 5.387 0 12s5.867 12 12.48 12c3.6 0 6.347-1.187 8.587-3.427 2.24-2.24 2.947-5.213 2.947-7.613 0-.76-.067-1.467-.173-2.053H12.48z"/>',
    samsung: '<path d="M24 10.743c0 6.64-8.814 10.971-15.666 8.356C1.48 16.485-1.996 9.47 1.905 5.565 6.471 1.006 17.584-1.976 21.66 2.106 23.366 3.812 24 6.84 24 10.743zm-9.06 6.33c4.16.89 6.225-2.58 4.414-5.325-1.93-2.92-5.464-2.486-6.68 1.123 1.483.567 1.677 3.962 2.266 4.202zm-3.69-3.32c-.997-1.636-1.933-1.503-2.32-.426-.95 2.652.887 5.486 3.327 3.313 1.077-.96.22-1.9.157-2.22-1.43 1.35-1.164-.28-.593-.526.903-.39-.124-.877-.57-.14z"/>',
    microsoft: '<path d="M11.55 11.55H.45V.45h11.1v11.1zm12 0H12.45V.45h11.1v11.1zm-12 12H.45V12.45h11.1v11.1zm12 0H12.45V12.45h11.1v11.1z"/>',
    asus: '<path d="M2.5 19.5L12 3l9.5 16.5H18l-1.5-3h-9l-1.5 3H2.5zm4.5-5h10L12 6 7 14.5z"/>', // Simplified generic generic triangle for asus/default
    default: '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/>',
  };

  interface Country {
    name: string;
    lat: number;
    lon: number;
    code: string;
  }

  const COUNTRIES: Country[] = [
    { name: 'Afghanistan', lat: 33.9391, lon: 67.7100, code: 'AF' },
    { name: 'Albania', lat: 41.1533, lon: 20.1683, code: 'AL' },
    { name: 'Algeria', lat: 28.0339, lon: 1.6596, code: 'DZ' },
    { name: 'Andorra', lat: 42.5063, lon: 1.5218, code: 'AD' },
    { name: 'Angola', lat: -11.2027, lon: 17.8739, code: 'AO' },
    { name: 'Antigua and Barbuda', lat: 17.0608, lon: -61.7964, code: 'AG' },
    { name: 'Argentina', lat: -38.4161, lon: -63.6167, code: 'AR' },
    { name: 'Armenia', lat: 40.0691, lon: 45.0382, code: 'AM' },
    { name: 'Australia', lat: -25.2744, lon: 133.7751, code: 'AU' },
    { name: 'Austria', lat: 47.5162, lon: 14.5501, code: 'AT' },
    { name: 'Azerbaijan', lat: 40.1431, lon: 47.5769, code: 'AZ' },
    { name: 'Bahamas', lat: 25.0343, lon: -77.3963, code: 'BS' },
    { name: 'Bahrain', lat: 26.0667, lon: 50.5577, code: 'BH' },
    { name: 'Bangladesh', lat: 23.6850, lon: 90.3563, code: 'BD' },
    { name: 'Barbados', lat: 13.1939, lon: -59.5432, code: 'BB' },
    { name: 'Belarus', lat: 53.7098, lon: 27.9534, code: 'BY' },
    { name: 'Belgium', lat: 50.5039, lon: 4.4699, code: 'BE' },
    { name: 'Belize', lat: 17.1899, lon: -88.4976, code: 'BZ' },
    { name: 'Benin', lat: 9.3077, lon: 2.3158, code: 'BJ' },
    { name: 'Bhutan', lat: 27.5142, lon: 90.4336, code: 'BT' },
    { name: 'Bolivia', lat: -16.2902, lon: -63.5887, code: 'BO' },
    { name: 'Bosnia and Herzegovina', lat: 43.9159, lon: 17.6791, code: 'BA' },
    { name: 'Botswana', lat: -22.3285, lon: 24.6849, code: 'BW' },
    { name: 'Brazil', lat: -14.2350, lon: -51.9253, code: 'BR' },
    { name: 'Brunei', lat: 4.5353, lon: 114.7277, code: 'BN' },
    { name: 'Bulgaria', lat: 42.7339, lon: 25.4858, code: 'BG' },
    { name: 'Burkina Faso', lat: 12.2383, lon: -1.5616, code: 'BF' },
    { name: 'Burundi', lat: -3.3731, lon: 29.9189, code: 'BI' },
    { name: 'Cabo Verde', lat: 16.5388, lon: -23.0418, code: 'CV' },
    { name: 'Cambodia', lat: 12.5657, lon: 104.9910, code: 'KH' },
    { name: 'Cameroon', lat: 7.3697, lon: 12.3547, code: 'CM' },
    { name: 'Canada', lat: 56.1304, lon: -106.3468, code: 'CA' },
    { name: 'Central African Republic', lat: 6.6111, lon: 20.9394, code: 'CF' },
    { name: 'Chad', lat: 15.4542, lon: 18.7322, code: 'TD' },
    { name: 'Chile', lat: -35.6751, lon: -71.5430, code: 'CL' },
    { name: 'China', lat: 35.8617, lon: 104.1954, code: 'CN' },
    { name: 'Colombia', lat: 4.5709, lon: -74.2973, code: 'CO' },
    { name: 'Comoros', lat: -11.8750, lon: 43.8722, code: 'KM' },
    { name: 'Congo (Congo-Brazzaville)', lat: -0.2280, lon: 15.8277, code: 'CG' },
    { name: 'Costa Rica', lat: 9.7489, lon: -83.7534, code: 'CR' },
    { name: 'Croatia', lat: 45.1000, lon: 15.2000, code: 'HR' },
    { name: 'Cuba', lat: 21.5218, lon: -77.7812, code: 'CU' },
    { name: 'Cyprus', lat: 35.1264, lon: 33.4299, code: 'CY' },
    { name: 'Czechia (Czech Republic)', lat: 49.8175, lon: 15.4730, code: 'CZ' },
    { name: 'Democratic Republic of the Congo', lat: -4.0383, lon: 21.7587, code: 'CD' },
    { name: 'Denmark', lat: 56.2639, lon: 9.5018, code: 'DK' },
    { name: 'Djibouti', lat: 11.8251, lon: 42.5903, code: 'DJ' },
    { name: 'Dominica', lat: 15.4150, lon: -61.3710, code: 'DM' },
    { name: 'Dominican Republic', lat: 18.7357, lon: -70.1627, code: 'DO' },
    { name: 'Ecuador', lat: -1.8312, lon: -78.1834, code: 'EC' },
    { name: 'Egypt', lat: 26.8206, lon: 30.8025, code: 'EG' },
    { name: 'El Salvador', lat: 13.7942, lon: -88.8965, code: 'SV' },
    { name: 'Equatorial Guinea', lat: 1.6508, lon: 10.2679, code: 'GQ' },
    { name: 'Eritrea', lat: 15.1794, lon: 39.7823, code: 'ER' },
    { name: 'Estonia', lat: 58.5953, lon: 25.0136, code: 'EE' },
    { name: 'Eswatini', lat: -26.5225, lon: 31.4659, code: 'SZ' },
    { name: 'Ethiopia', lat: 9.1450, lon: 40.4897, code: 'ET' },
    { name: 'Fiji', lat: -17.7134, lon: 178.0650, code: 'FJ' },
    { name: 'Finland', lat: 61.9241, lon: 25.7482, code: 'FI' },
    { name: 'France', lat: 46.2276, lon: 2.2137, code: 'FR' },
    { name: 'Gabon', lat: -0.8037, lon: 11.6094, code: 'GA' },
    { name: 'Gambia', lat: 13.4432, lon: -15.3101, code: 'GM' },
    { name: 'Georgia', lat: 42.3154, lon: 43.3569, code: 'GE' },
    { name: 'Germany', lat: 51.1657, lon: 10.4515, code: 'DE' },
    { name: 'Ghana', lat: 7.9465, lon: -1.0232, code: 'GH' },
    { name: 'Greece', lat: 39.0742, lon: 21.8243, code: 'GR' },
    { name: 'Grenada', lat: 12.1165, lon: -61.6790, code: 'GD' },
    { name: 'Guatemala', lat: 15.7835, lon: -90.2308, code: 'GT' },
    { name: 'Guinea', lat: 9.9456, lon: -9.6966, code: 'GN' },
    { name: 'Guinea-Bissau', lat: 11.8037, lon: -15.1804, code: 'GW' },
    { name: 'Guyana', lat: 4.8604, lon: -58.9302, code: 'GY' },
    { name: 'Haiti', lat: 18.9712, lon: -72.2852, code: 'HT' },
    { name: 'Honduras', lat: 15.2000, lon: -86.2419, code: 'HN' },
    { name: 'Hungary', lat: 47.1625, lon: 19.5033, code: 'HU' },
    { name: 'Iceland', lat: 64.9631, lon: -19.0208, code: 'IS' },
    { name: 'India', lat: 20.5937, lon: 78.9629, code: 'IN' },
    { name: 'Indonesia', lat: -0.7893, lon: 113.9213, code: 'ID' },
    { name: 'Iran', lat: 32.4279, lon: 53.6880, code: 'IR' },
    { name: 'Iraq', lat: 33.2232, lon: 43.6793, code: 'IQ' },
    { name: 'Ireland', lat: 53.1424, lon: -7.6921, code: 'IE' },
    { name: 'Israel', lat: 31.0461, lon: 34.8516, code: 'IL' },
    { name: 'Italy', lat: 41.8719, lon: 12.5674, code: 'IT' },
    { name: 'Jamaica', lat: 18.1096, lon: -77.2975, code: 'JM' },
    { name: 'Japan', lat: 36.2048, lon: 138.2529, code: 'JP' },
    { name: 'Jordan', lat: 30.5852, lon: 36.2384, code: 'JO' },
    { name: 'Kazakhstan', lat: 48.0196, lon: 66.9237, code: 'KZ' },
    { name: 'Kenya', lat: -0.0236, lon: 37.9062, code: 'KE' },
    { name: 'Kiribati', lat: -3.3704, lon: -168.7340, code: 'KI' },
    { name: 'Kuwait', lat: 29.3117, lon: 47.4818, code: 'KW' },
    { name: 'Kyrgyzstan', lat: 41.2044, lon: 74.7661, code: 'KG' },
    { name: 'Laos', lat: 19.8563, lon: 102.4955, code: 'LA' },
    { name: 'Latvia', lat: 56.8796, lon: 24.6032, code: 'LV' },
    { name: 'Lebanon', lat: 33.8547, lon: 35.8623, code: 'LB' },
    { name: 'Lesotho', lat: -29.6099, lon: 28.2336, code: 'LS' },
    { name: 'Liberia', lat: 6.4281, lon: -9.4295, code: 'LR' },
    { name: 'Libya', lat: 26.3351, lon: 17.2283, code: 'LY' },
    { name: 'Liechtenstein', lat: 47.1660, lon: 9.5554, code: 'LI' },
    { name: 'Lithuania', lat: 55.1694, lon: 23.8813, code: 'LT' },
    { name: 'Luxembourg', lat: 49.8153, lon: 6.1296, code: 'LU' },
    { name: 'Madagascar', lat: -18.7669, lon: 46.8691, code: 'MG' },
    { name: 'Malawi', lat: -13.2543, lon: 34.3015, code: 'MW' },
    { name: 'Malaysia', lat: 4.2105, lon: 101.9758, code: 'MY' },
    { name: 'Maldives', lat: 3.2028, lon: 73.2207, code: 'MV' },
    { name: 'Mali', lat: 17.5707, lon: -3.9962, code: 'ML' },
    { name: 'Malta', lat: 35.9375, lon: 14.3754, code: 'MT' },
    { name: 'Marshall Islands', lat: 7.1315, lon: 171.1845, code: 'MH' },
    { name: 'Mauritania', lat: 21.0079, lon: -10.9408, code: 'MR' },
    { name: 'Mauritius', lat: -20.3484, lon: 57.5522, code: 'MU' },
    { name: 'Mexico', lat: 23.6345, lon: -102.5528, code: 'MX' },
    { name: 'Micronesia', lat: 7.4256, lon: 150.5508, code: 'FM' },
    { name: 'Moldova', lat: 47.4116, lon: 28.3699, code: 'MD' },
    { name: 'Monaco', lat: 43.7384, lon: 7.4246, code: 'MC' },
    { name: 'Mongolia', lat: 46.8625, lon: 103.8467, code: 'MN' },
    { name: 'Montenegro', lat: 42.7087, lon: 19.3744, code: 'ME' },
    { name: 'Morocco', lat: 31.7917, lon: -7.0926, code: 'MA' },
    { name: 'Mozambique', lat: -18.6657, lon: 35.5296, code: 'MZ' },
    { name: 'Myanmar (Burma)', lat: 21.9162, lon: 95.9560, code: 'MM' },
    { name: 'Namibia', lat: -22.9576, lon: 18.4904, code: 'NA' },
    { name: 'Nauru', lat: -0.5228, lon: 166.9315, code: 'NR' },
    { name: 'Nepal', lat: 28.3949, lon: 84.1240, code: 'NP' },
    { name: 'Netherlands', lat: 52.1326, lon: 5.2913, code: 'NL' },
    { name: 'New Zealand', lat: -40.9006, lon: 174.8860, code: 'NZ' },
    { name: 'Nicaragua', lat: 12.8654, lon: -85.2072, code: 'NI' },
    { name: 'Niger', lat: 17.6078, lon: 8.0817, code: 'NE' },
    { name: 'Nigeria', lat: 9.0820, lon: 8.6753, code: 'NG' },
    { name: 'North Korea', lat: 40.3399, lon: 127.5101, code: 'KP' },
    { name: 'North Macedonia', lat: 41.6086, lon: 21.7453, code: 'MK' },
    { name: 'Norway', lat: 60.4720, lon: 8.4689, code: 'NO' },
    { name: 'Oman', lat: 21.5126, lon: 55.9233, code: 'OM' },
    { name: 'Pakistan', lat: 30.3753, lon: 69.3451, code: 'PK' },
    { name: 'Palau', lat: 7.5150, lon: 134.5825, code: 'PW' },
    { name: 'Panama', lat: 8.5380, lon: -80.7821, code: 'PA' },
    { name: 'Papua New Guinea', lat: -6.314993, lon: 143.9555, code: 'PG' },
    { name: 'Paraguay', lat: -23.4425, lon: -58.4438, code: 'PY' },
    { name: 'Peru', lat: -9.1900, lon: -75.0152, code: 'PE' },
    { name: 'Philippines', lat: 12.8797, lon: 121.7740, code: 'PH' },
    { name: 'Poland', lat: 51.9194, lon: 19.1451, code: 'PL' },
    { name: 'Portugal', lat: 39.3999, lon: -8.2245, code: 'PT' },
    { name: 'Qatar', lat: 25.3548, lon: 51.1839, code: 'QA' },
    { name: 'Romania', lat: 45.9432, lon: 24.9668, code: 'RO' },
    { name: 'Russia', lat: 61.5240, lon: 105.3188, code: 'RU' },
    { name: 'Rwanda', lat: -1.9403, lon: 29.8739, code: 'RW' },
    { name: 'Saint Kitts and Nevis', lat: 17.3578, lon: -62.7830, code: 'KN' },
    { name: 'Saint Lucia', lat: 13.9094, lon: -60.9789, code: 'LC' },
    { name: 'Saint Vincent and the Grenadines', lat: 12.9843, lon: -61.2872, code: 'VC' },
    { name: 'Samoa', lat: -13.7590, lon: -172.1046, code: 'WS' },
    { name: 'San Marino', lat: 43.9424, lon: 12.4578, code: 'SM' },
    { name: 'Sao Tome and Principe', lat: 0.1864, lon: 6.6131, code: 'ST' },
    { name: 'Saudi Arabia', lat: 23.8859, lon: 45.0792, code: 'SA' },
    { name: 'Senegal', lat: 14.4974, lon: -14.4524, code: 'SN' },
    { name: 'Serbia', lat: 44.0165, lon: 21.0059, code: 'RS' },
    { name: 'Seychelles', lat: -4.6796, lon: 55.4920, code: 'SC' },
    { name: 'Sierra Leone', lat: 8.4606, lon: -11.7799, code: 'SL' },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198, code: 'SG' },
    { name: 'Slovakia', lat: 48.6690, lon: 19.6990, code: 'SK' },
    { name: 'Slovenia', lat: 46.1512, lon: 14.9955, code: 'SI' },
    { name: 'Solomon Islands', lat: -9.6457, lon: 160.1562, code: 'SB' },
    { name: 'Somalia', lat: 5.1521, lon: 46.1996, code: 'SO' },
    { name: 'South Africa', lat: -30.5595, lon: 22.9375, code: 'ZA' },
    { name: 'South Korea', lat: 35.9078, lon: 127.7669, code: 'KR' },
    { name: 'South Sudan', lat: 6.8770, lon: 31.3070, code: 'SS' },
    { name: 'Spain', lat: 40.4637, lon: -3.7492, code: 'ES' },
    { name: 'Sri Lanka', lat: 7.8731, lon: 80.7718, code: 'LK' },
    { name: 'Sudan', lat: 12.8628, lon: 30.2176, code: 'SD' },
    { name: 'Suriname', lat: 3.9193, lon: -56.0278, code: 'SR' },
    { name: 'Sweden', lat: 60.1282, lon: 18.6435, code: 'SE' },
    { name: 'Switzerland', lat: 46.8182, lon: 8.2275, code: 'CH' },
    { name: 'Syria', lat: 34.8021, lon: 38.9968, code: 'SY' },
    { name: 'Taiwan', lat: 23.6978, lon: 120.9605, code: 'TW' },
    { name: 'Tajikistan', lat: 38.8610, lon: 71.2761, code: 'TJ' },
    { name: 'Tanzania', lat: -6.3690, lon: 34.8888, code: 'TZ' },
    { name: 'Thailand', lat: 15.8700, lon: 100.9925, code: 'TH' },
    { name: 'Timor-Leste', lat: -8.8742, lon: 125.7275, code: 'TL' },
    { name: 'Togo', lat: 8.6195, lon: 0.8248, code: 'TG' },
    { name: 'Tonga', lat: -21.1790, lon: -175.1982, code: 'TO' },
    { name: 'Trinidad and Tobago', lat: 10.6918, lon: -61.2225, code: 'TT' },
    { name: 'Tunisia', lat: 33.8869, lon: 9.5375, code: 'TN' },
    { name: 'Turkey', lat: 38.9637, lon: 35.2433, code: 'TR' },
    { name: 'Turkmenistan', lat: 38.9697, lon: 59.5563, code: 'TM' },
    { name: 'Tuvalu', lat: -7.1095, lon: 177.6493, code: 'TV' },
    { name: 'Uganda', lat: 1.3733, lon: 32.2903, code: 'UG' },
    { name: 'Ukraine', lat: 48.3794, lon: 31.1656, code: 'UA' },
    { name: 'United Arab Emirates', lat: 23.4241, lon: 53.8478, code: 'AE' },
    { name: 'United Kingdom', lat: 55.3781, lon: -3.4360, code: 'GB' },
    { name: 'United States', lat: 37.0902, lon: -95.7129, code: 'US' },
    { name: 'Uruguay', lat: -32.5228, lon: -55.7658, code: 'UY' },
    { name: 'Uzbekistan', lat: 41.3775, lon: 64.5853, code: 'UZ' },
    { name: 'Vanuatu', lat: -15.3767, lon: 166.9592, code: 'VU' },
    { name: 'Vatican City', lat: 41.9029, lon: 12.4534, code: 'VA' },
    { name: 'Venezuela', lat: 6.4238, lon: -66.5897, code: 'VE' },
    { name: 'Vietnam', lat: 14.0583, lon: 108.2772, code: 'VN' },
    { name: 'Yemen', lat: 15.5527, lon: 48.5164, code: 'YE' },
    { name: 'Zambia', lat: -13.1339, lon: 27.8493, code: 'ZM' },
    { name: 'Zimbabwe', lat: -19.0154, lon: 29.1549, code: 'ZW' }
  ];

  const state = {
    cpuThrottlingRate: 1,
    networkConditions: 'No emulation',
    geolocation: null as {latitude: number, longitude: number} | null,
    selectedCountry: null as Country | null,
    colorScheme: 'auto',
    viewport: null as Viewport | null,
    selectedDevice: null as Device | null,
  };

  const resizeObserver = new ResizeObserver(() => {
    const rect = document.documentElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    send('ui/notifications/size-changed', { width, height });
  });
  resizeObserver.observe(document.documentElement);

  // ... CPU, Network, Color Scheme functions (same as before) ...
  // ... CPU, Network, Color Scheme functions (same as before) ...
  function selectCPUThrottling(rate: number, btn: HTMLElement) {
    state.cpuThrottlingRate = rate;
    updateActiveButton('cpu-grid', btn);
  }

  function selectNetworkThrottling(condition: string, btn: HTMLElement) {
    state.networkConditions = condition;
    updateActiveButton('network-grid', btn);
  }

  function selectColorScheme(scheme: string, btn: HTMLElement) {
    state.colorScheme = scheme;
    updateActiveButton('color-scheme-grid', btn);
  }

  // --- Country Geolocation Logic ---

  function filterCountries(query: string) {
    const dropdown = document.getElementById('countryDropdown');
    
    if (dropdown) {
      dropdown.innerHTML = '';
      const lowerQuery = query.toLowerCase();
      const matches = COUNTRIES.filter(c => c.name.toLowerCase().includes(lowerQuery));

      if (matches.length === 0) {
         dropdown.style.display = 'none';
         return;
      }
      
      matches.forEach(country => {
        const item = document.createElement('div');
        item.className = 'country-item';
        item.innerText = country.name;
        item.onclick = () => selectCountry(country);
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    }
  }

  function selectCountry(country: Country) {
    state.selectedCountry = country;
    state.geolocation = {
      latitude: country.lat,
      longitude: country.lon
    };
    
    const input = document.getElementById('countrySearch') as HTMLInputElement;
    if (input) {
      input.value = country.name;
    }
    
    const dropdown = document.getElementById('countryDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  function clearGeolocation() {
    state.selectedCountry = null;
    state.geolocation = null;
    const input = document.getElementById('countrySearch') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
    const dropdown = document.getElementById('countryDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  // Close dropdown when clicking outside
  window.addEventListener('click', (event) => {
    const dropdown = document.getElementById('countryDropdown');
    const input = document.getElementById('countrySearch');
    if (dropdown && input && event.target !== input && event.target !== dropdown) {
       dropdown.style.display = 'none';
    }
  });


  function updateActiveButton(gridId: string, activeBtn: HTMLElement | null) {
    const grid = document.getElementById(gridId);
    if (!grid) {
      return;
    }
    const selector = gridId === 'viewport-grid' ? '.viewport-option' : 'button';
    grid.querySelectorAll(selector).forEach((btn) => btn.classList.remove('active'));
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  function applySettings() {
    // Custom rate is directly in state.cpuThrottlingRate from confirmCustomCPU
    const finalRate = state.cpuThrottlingRate;
    
    updateStatus('Applying emulation settings...');
    
    // Disable button and change text
    const btn = document.getElementById('applyBtn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'emulation set';
    }

    sendToolsCall({
      cpuThrottlingRate: finalRate,
      networkConditions: state.networkConditions,
      geolocation: state.geolocation,
      colorScheme: state.colorScheme,
      viewport: state.viewport,
    });
  }

  // --- Modal Logic ---

  function closeDeviceModal(event?: Event) {
    if (event && event.target !== event.currentTarget) {
      return;
    }
    const modal = document.getElementById('deviceModal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 200);
    }
  }

  function selectViewport(type: string, btn: HTMLElement) {
    if (type === 'reset') {
      state.viewport = null;
      state.selectedDevice = null;
      resetViewportButtons(); // Reset labels/icons
      updateActiveButton('viewport-grid', btn);
      return;
    }

    // Opens modal for mobile, tablet, desktop
    showDeviceModal(type);
  }

  function resetViewportButtons() {
     // Restore default labels and icons if needed
     // For now we just reset the text content to default if we want to be strict,
     // but the requirement says "the mobile button should have device name and logo next to the current mobile logo"
     // which implies we modify the button content permanently until reset.
     
     // To implement this cleanly, we can revert innerHTML of buttons to their original state.
     // But since we are inside the app, we might need to store the original state or just rebuild it.
     // Hardcoding original state here for simplicity as we know the structure.
     
     const mobileBtn = document.querySelector('[data-viewport="mobile"]');
     if (mobileBtn) {
       mobileBtn.innerHTML = `
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
        <span class="viewport-label">Mobile</span>
       `;
     }
     const tabletBtn = document.querySelector('[data-viewport="tablet"]');
     if (tabletBtn) {
        tabletBtn.innerHTML = `
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
        <span class="viewport-label">Tablet</span>
        `;
     }
     const desktopBtn = document.querySelector('[data-viewport="desktop"]');
     if (desktopBtn) {
        desktopBtn.innerHTML = `
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span class="viewport-label">Desktop</span>
        `;
     }
  }

  function showDeviceModal(type: string) {
    const modal = document.getElementById('deviceModal');
    const title = document.getElementById('modalTitle');
    const list = document.getElementById('deviceList');

    if (!modal || !title || !list) {
      return;
    }

    title.innerText = `Select ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    list.innerHTML = '';

    const devices = DEVICES.filter((d) => d.type === type);

    devices.forEach((device) => {
      const item = document.createElement('div');
      item.className = 'device-item';
      if (state.selectedDevice && state.selectedDevice.name === device.name) {
        item.classList.add('active');
      }

      const iconSvg = BRAND_ICONS[device.brand] || BRAND_ICONS.default;
      
      item.innerHTML = `
        <div class="device-icon">
          <svg viewBox="0 0 24 24" class="device-brand-icon">${iconSvg}</svg>
        </div>
        <div class="device-info">
          <div class="device-name">${device.name}</div>
          <div class="device-specs">${device.width}x${device.height} • DPR ${device.dpr}${device.notes ? ' • ' + device.notes : ''}</div>
        </div>
      `;

      item.onclick = () => {
        selectDevice(device, type);
      };

      list.appendChild(item);
    });

    modal.style.display = 'flex';
    // Trigger reflow
    modal.offsetHeight;
    modal.classList.add('open');
  }

  function selectDevice(device: Device, type: string) {
    state.selectedDevice = device;
    state.viewport = {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.dpr,
      isMobile: type === 'mobile' || type === 'tablet', // Tablet also usually considers as mobile/touch in devtools
      hasTouch: type === 'mobile' || type === 'tablet',
      isLandscape: false,
    };

    closeDeviceModal();
    updateViewportButtonUI(type, device);
    
    // Highlight the correct button group
    const btn = document.querySelector(`[data-viewport="${type}"]`) as HTMLElement;
    updateActiveButton('viewport-grid', btn);
  }

  function updateViewportButtonUI(type: string, device: Device) {
    resetViewportButtons();

    const btn = document.querySelector(`[data-viewport="${type}"]`);
    if (btn) {
     const iconSvg = BRAND_ICONS[device.brand] || BRAND_ICONS.default;
     const originalIcon = btn.querySelector('.viewport-icon')?.outerHTML || '';

      btn.innerHTML = `
        ${originalIcon}
        <span class="viewport-label" style="display: flex; align-items: center; gap: 4px;">
           ${device.name}
           <svg viewBox="0 0 24 24" style="width:12px; height:12px; fill:currentColor; opacity:0.8;">${iconSvg}</svg>
        </span>
      `;
    }
  }

  function updateStatus(msg: string) {
    const status = document.getElementById('status');
    if (status) {
      status.innerText = msg;
    }
  }

  function sendToolsCall(args: unknown) {
    const id = nextRequestId++;
    send('tools/call', {
      name: 'emulate_set_parameters',
      arguments: args,
    }, id);
  }

  window.addEventListener('message', (event) => {
    const { method, params, id, result } = event.data;

    if (method === 'ui/notifications/tool-result') {
      const content = params && params.content;
      const text = content && content[0] && content[0].text;
      if (text && text.indexOf('EMULATION_SETTINGS_APPLIED') !== -1) {
        updateStatus('emulation is set');
      }
    }

    if (id !== undefined && result) {
      const content = result.content;
      const text = content && content[0] && content[0].text;
      if (text && text.indexOf('EMULATION_SETTINGS_APPLIED') !== -1) {
        updateStatus('emulation is set');
      }
    }

    if (id !== undefined && method === 'ui/resource-teardown') {
      sendResponse(id, {});
    }
  });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectCPUThrottling = selectCPUThrottling;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectNetworkThrottling = selectNetworkThrottling;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectColorScheme = selectColorScheme;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.applySettings = applySettings;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.clearGeolocation = clearGeolocation;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectViewport = selectViewport;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.closeDeviceModal = closeDeviceModal;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.filterCountries = filterCountries;
}

export const EMULATION_APP_SCRIPT = `(${EmulationApp.toString()})()`;
