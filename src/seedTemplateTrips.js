/**
 * Seed script for Template Trips.
 * Run once: node src/seedTemplateTrips.js
 *
 * Inserts curated template trips into the TemplateTrip collection.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import TemplateTrip from "./models/TemplateTrip.js";

const TEMPLATE_TRIPS = [
    {
        title: "3-Day Rome Trip",
        destination: "Rome, Italy",
        days: 3,
        description: "Ancient ruins, Renaissance art, and Italian cuisine in the Eternal City",
        coverImage: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80",
        tags: ["history", "art", "food", "culture"],
        spots: 12,
        itinerary: [
            {
                day: 1,
                theme: "Ancient Rome & City Center",
                places: [
                    {
                        name: "Colosseum",
                        description: "The iconic amphitheater of ancient Rome, once hosting gladiatorial contests",
                        category: "history",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 41.8902, lng: 12.4922 },
                        address: "Piazza del Colosseo, 1, 00184 Roma RM, Italy",
                    },
                    {
                        name: "Roman Forum",
                        description: "The heart of ancient Rome with ruins of government buildings and temples",
                        category: "history",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 41.8925, lng: 12.4853 },
                        address: "Via della Salara Vecchia, 5/6, 00186 Roma RM, Italy",
                    },
                    {
                        name: "Pantheon",
                        description: "A remarkably preserved ancient temple with the world's largest unreinforced concrete dome",
                        category: "history",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 41.8986, lng: 12.4769 },
                        address: "Piazza della Rotonda, 00186 Roma RM, Italy",
                    },
                    {
                        name: "Trevi Fountain",
                        description: "Baroque masterpiece and Rome's largest fountain — toss a coin for good luck",
                        category: "sightseeing",
                        estimatedTimeHours: 0.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 41.9009, lng: 12.4833 },
                        address: "Piazza di Trevi, 00187 Roma RM, Italy",
                    },
                ],
            },
            {
                day: 2,
                theme: "Vatican & Art Treasures",
                places: [
                    {
                        name: "Vatican Museums",
                        description: "World-class art collection including the Gallery of Maps and Raphael Rooms",
                        category: "museum",
                        estimatedTimeHours: 3,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 41.9065, lng: 12.4536 },
                        address: "Viale Vaticano, 00165 Roma RM, Italy",
                    },
                    {
                        name: "Sistine Chapel",
                        description: "Michelangelo's breathtaking ceiling frescoes and The Last Judgment",
                        category: "museum",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 41.9029, lng: 12.4545 },
                        address: "Città del Vaticano, 00120, Vatican City",
                    },
                    {
                        name: "St. Peter's Basilica",
                        description: "The world's largest church, a Renaissance masterpiece by Michelangelo and Bernini",
                        category: "sightseeing",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 41.9022, lng: 12.4539 },
                        address: "Piazza San Pietro, 00120 Città del Vaticano, Vatican City",
                    },
                    {
                        name: "Trastevere",
                        description: "Charming neighborhood with cobblestone streets, trattorias, and vibrant nightlife",
                        category: "food",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 41.8869, lng: 12.4694 },
                        address: "Trastevere, Roma RM, Italy",
                    },
                ],
            },
            {
                day: 3,
                theme: "Baroque Rome & Dolce Vita",
                places: [
                    {
                        name: "Borghese Gallery",
                        description: "Stunning collection of Bernini sculptures and Caravaggio paintings in a beautiful villa",
                        category: "museum",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 41.9142, lng: 12.4922 },
                        address: "Piazzale Scipione Borghese, 5, 00197 Roma RM, Italy",
                    },
                    {
                        name: "Spanish Steps",
                        description: "Monumental stairway of 135 steps connecting Piazza di Spagna to Trinità dei Monti",
                        category: "sightseeing",
                        estimatedTimeHours: 0.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 41.9060, lng: 12.4828 },
                        address: "Piazza di Spagna, 00187 Roma RM, Italy",
                    },
                    {
                        name: "Piazza Navona",
                        description: "Elegant square with Bernini's Fountain of the Four Rivers and lively street artists",
                        category: "sightseeing",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 41.8992, lng: 12.4731 },
                        address: "Piazza Navona, 00186 Roma RM, Italy",
                    },
                    {
                        name: "Campo de' Fiori",
                        description: "Vibrant market square by day, bustling dining scene by night",
                        category: "food",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 41.8957, lng: 12.4722 },
                        address: "Piazza Campo de' Fiori, 00186 Roma RM, Italy",
                    },
                ],
            },
        ],
        discoveredPlaces: [],
    },
    {
        title: "5-Day Greece Trip",
        destination: "Athens & Santorini, Greece",
        days: 5,
        description: "Ancient wonders in Athens and stunning sunsets in Santorini",
        coverImage: "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=800&q=80",
        tags: ["history", "beaches", "nature", "culture"],
        spots: 16,
        itinerary: [
            {
                day: 1,
                theme: "Ancient Athens",
                places: [
                    {
                        name: "Acropolis of Athens",
                        description: "The iconic citadel above Athens, home to the Parthenon and ancient Greek temples",
                        category: "history",
                        estimatedTimeHours: 3,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 37.9715, lng: 23.7267 },
                        address: "Athens 105 58, Greece",
                    },
                    {
                        name: "Acropolis Museum",
                        description: "Modern museum displaying artifacts found on and around the Acropolis",
                        category: "museum",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 37.9684, lng: 23.7286 },
                        address: "Dionysiou Areopagitou 15, Athens 117 42, Greece",
                    },
                    {
                        name: "Plaka District",
                        description: "Historic neighborhood below the Acropolis with neoclassical architecture and tavernas",
                        category: "food",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 37.9730, lng: 23.7292 },
                        address: "Plaka, Athens, Greece",
                    },
                ],
            },
            {
                day: 2,
                theme: "Athens Highlights",
                places: [
                    {
                        name: "Ancient Agora",
                        description: "The ancient marketplace and civic center of Athens with the Temple of Hephaestus",
                        category: "history",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 37.9747, lng: 23.7225 },
                        address: "Adrianou 24, Athens 105 55, Greece",
                    },
                    {
                        name: "National Archaeological Museum",
                        description: "Greece's largest museum with world-famous collections of ancient Greek art",
                        category: "museum",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 37.9893, lng: 23.7323 },
                        address: "28is Oktovriou 44, Athens 106 82, Greece",
                    },
                    {
                        name: "Monastiraki Flea Market",
                        description: "Vibrant bazaar district with antiques, souvenirs, and street food",
                        category: "shopping",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 37.9763, lng: 23.7253 },
                        address: "Monastiraki, Athens, Greece",
                    },
                ],
            },
            {
                day: 3,
                theme: "Arrival in Santorini — Fira & Imerovigli",
                places: [
                    {
                        name: "Fira Town",
                        description: "Santorini's vibrant capital perched on the caldera cliff with stunning views",
                        category: "sightseeing",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 36.4168, lng: 25.4321 },
                        address: "Fira, Santorini, Greece",
                    },
                    {
                        name: "Imerovigli",
                        description: "The highest point on the caldera, known as the 'Balcony to the Aegean'",
                        category: "nature",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.4310, lng: 25.4227 },
                        address: "Imerovigli, Santorini, Greece",
                    },
                    {
                        name: "Skaros Rock",
                        description: "A dramatic rocky headland with panoramic caldera views and a historic fortress ruin",
                        category: "adventure",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.4334, lng: 25.4194 },
                        address: "Skaros Rock, Imerovigli, Santorini, Greece",
                    },
                ],
            },
            {
                day: 4,
                theme: "Oia & Beaches",
                places: [
                    {
                        name: "Oia Village",
                        description: "The most photographed village in Santorini with blue-domed churches and whitewashed houses",
                        category: "sightseeing",
                        estimatedTimeHours: 3,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 36.4618, lng: 25.3753 },
                        address: "Oia, Santorini, Greece",
                    },
                    {
                        name: "Amoudi Bay",
                        description: "A hidden gem below Oia with crystal-clear waters and seaside tavernas",
                        category: "nature",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.4652, lng: 25.3697 },
                        address: "Amoudi Bay, Oia, Santorini, Greece",
                    },
                    {
                        name: "Red Beach",
                        description: "Dramatic beach surrounded by striking red volcanic cliffs",
                        category: "nature",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.3490, lng: 25.3953 },
                        address: "Red Beach, Akrotiri, Santorini, Greece",
                    },
                    {
                        name: "Oia Sunset Point",
                        description: "The world-famous sunset viewpoint at the ruins of the Byzantine Castle",
                        category: "sightseeing",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 36.4614, lng: 25.3718 },
                        address: "Castle Ruins, Oia, Santorini, Greece",
                    },
                ],
            },
            {
                day: 5,
                theme: "Wine, History & Farewell",
                places: [
                    {
                        name: "Akrotiri Archaeological Site",
                        description: "A Minoan Bronze Age settlement preserved under volcanic ash — the 'Pompeii of the Aegean'",
                        category: "history",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 36.3519, lng: 25.4035 },
                        address: "Akrotiri, Santorini, Greece",
                    },
                    {
                        name: "Santo Wines Winery",
                        description: "Award-winning winery with caldera views and tastings of Assyrtiko and Vinsanto wines",
                        category: "food",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.3872, lng: 25.4484 },
                        address: "Pyrgos, Santorini, Greece",
                    },
                    {
                        name: "Pyrgos Village",
                        description: "Medieval hilltop village with panoramic views and authentic Cycladic atmosphere",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 36.3880, lng: 25.4460 },
                        address: "Pyrgos, Santorini, Greece",
                    },
                ],
            },
        ],
        discoveredPlaces: [],
    },
    {
        title: "2-Day Paris Trip",
        destination: "Paris, France",
        days: 2,
        description: "Art, architecture, and romance in the City of Light",
        coverImage: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80",
        tags: ["art", "food", "culture", "romance"],
        spots: 9,
        itinerary: [
            {
                day: 1,
                theme: "Iconic Landmarks & Art",
                places: [
                    {
                        name: "Eiffel Tower",
                        description: "The iconic iron lattice tower and symbol of Paris — ascend for panoramic city views",
                        category: "sightseeing",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 48.8584, lng: 2.2945 },
                        address: "Champ de Mars, 5 Av. Anatole France, 75007 Paris, France",
                    },
                    {
                        name: "Musée du Louvre",
                        description: "The world's largest art museum housing the Mona Lisa and Venus de Milo",
                        category: "museum",
                        estimatedTimeHours: 3,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 48.8606, lng: 2.3376 },
                        address: "Rue de Rivoli, 75001 Paris, France",
                    },
                    {
                        name: "Notre-Dame Cathedral",
                        description: "Masterpiece of French Gothic architecture on the Île de la Cité",
                        category: "history",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 48.8530, lng: 2.3499 },
                        address: "6 Parvis Notre-Dame, 75004 Paris, France",
                    },
                    {
                        name: "Seine River Cruise",
                        description: "Scenic boat cruise past illuminated landmarks along the River Seine",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 48.8599, lng: 2.2945 },
                        address: "Port de la Bourdonnais, 75007 Paris, France",
                    },
                ],
            },
            {
                day: 2,
                theme: "Montmartre & Culture",
                places: [
                    {
                        name: "Sacré-Cœur Basilica",
                        description: "Stunning white basilica atop Montmartre hill with sweeping views of Paris",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 48.8867, lng: 2.3431 },
                        address: "35 Rue du Chevalier de la Barre, 75018 Paris, France",
                    },
                    {
                        name: "Montmartre",
                        description: "Bohemian hilltop neighborhood with artists, cafés, and the Place du Tertre",
                        category: "culture",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 48.8862, lng: 2.3401 },
                        address: "Montmartre, 75018 Paris, France",
                    },
                    {
                        name: "Musée d'Orsay",
                        description: "Impressionist masterpieces by Monet, Renoir, and Van Gogh in a converted railway station",
                        category: "museum",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 48.8600, lng: 2.3266 },
                        address: "1 Rue de la Légion d'Honneur, 75007 Paris, France",
                    },
                    {
                        name: "Champs-Élysées & Arc de Triomphe",
                        description: "Stroll down the world's most famous avenue to the monumental triumphal arch",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 48.8738, lng: 2.2950 },
                        address: "Place Charles de Gaulle, 75008 Paris, France",
                    },
                    {
                        name: "Le Marais Evening Walk",
                        description: "Trendy neighborhood with art galleries, boutiques, and some of Paris's best falafel",
                        category: "food",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 48.8566, lng: 2.3608 },
                        address: "Le Marais, 75004 Paris, France",
                    },
                ],
            },
        ],
        discoveredPlaces: [],
    },
    {
        title: "4-Day Tokyo Trip",
        destination: "Tokyo, Japan",
        days: 4,
        description: "Neon-lit streets, ancient temples, and culinary wonders in Japan's capital",
        coverImage: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80",
        tags: ["culture", "food", "shopping", "temples"],
        spots: 16,
        itinerary: [
            {
                day: 1,
                theme: "Traditional Tokyo",
                places: [
                    {
                        name: "Senso-ji Temple",
                        description: "Tokyo's oldest temple in Asakusa with the iconic Kaminarimon (Thunder Gate)",
                        category: "spiritual",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.7148, lng: 139.7967 },
                        address: "2-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan",
                    },
                    {
                        name: "Nakamise Shopping Street",
                        description: "Historic shopping street leading to Senso-ji with traditional snacks and souvenirs",
                        category: "shopping",
                        estimatedTimeHours: 1,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.7122, lng: 139.7964 },
                        address: "1-36-3 Asakusa, Taito City, Tokyo, Japan",
                    },
                    {
                        name: "Meiji Shrine",
                        description: "Serene Shinto shrine nestled in an expansive forested park in the heart of Tokyo",
                        category: "spiritual",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.6764, lng: 139.6993 },
                        address: "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan",
                    },
                    {
                        name: "Harajuku & Takeshita Street",
                        description: "Tokyo's youth fashion hub with quirky shops, crêpes, and colorful street fashion",
                        category: "shopping",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.6702, lng: 139.7026 },
                        address: "Jingumae, Shibuya City, Tokyo, Japan",
                    },
                ],
            },
            {
                day: 2,
                theme: "Shibuya, Shinjuku & Nightlife",
                places: [
                    {
                        name: "Shibuya Crossing",
                        description: "The world's busiest pedestrian crossing — an electrifying experience",
                        category: "sightseeing",
                        estimatedTimeHours: 0.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.6595, lng: 139.7004 },
                        address: "2-2-1 Dogenzaka, Shibuya City, Tokyo, Japan",
                    },
                    {
                        name: "Shibuya Sky",
                        description: "Open-air rooftop observation deck at 230m with 360° views of Tokyo's skyline",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.6584, lng: 139.7022 },
                        address: "2-24-12 Shibuya, Shibuya City, Tokyo, Japan",
                    },
                    {
                        name: "Shinjuku Gyoen National Garden",
                        description: "Beautiful garden blending Japanese, English, and French landscaping styles",
                        category: "nature",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.6852, lng: 139.7100 },
                        address: "11 Naitomachi, Shinjuku City, Tokyo 160-0014, Japan",
                    },
                    {
                        name: "Golden Gai",
                        description: "A labyrinth of narrow alleys packed with tiny, themed bars in Shinjuku",
                        category: "food",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 35.6940, lng: 139.7036 },
                        address: "1 Chome Kabukicho, Shinjuku City, Tokyo, Japan",
                    },
                ],
            },
            {
                day: 3,
                theme: "Akihabara, Ueno & Culture",
                places: [
                    {
                        name: "Akihabara Electric Town",
                        description: "The mecca of anime, manga, gaming, and electronics culture",
                        category: "shopping",
                        estimatedTimeHours: 2.5,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.7023, lng: 139.7745 },
                        address: "Akihabara, Taito City, Tokyo, Japan",
                    },
                    {
                        name: "Ueno Park",
                        description: "Spacious public park home to multiple museums, temples, and a zoo",
                        category: "nature",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.7146, lng: 139.7732 },
                        address: "Uenokoen, Taito City, Tokyo 110-0007, Japan",
                    },
                    {
                        name: "Tokyo National Museum",
                        description: "Japan's oldest and largest museum with extensive collections of art and antiquities",
                        category: "museum",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.7189, lng: 139.7766 },
                        address: "13-9 Uenokoen, Taito City, Tokyo 110-8712, Japan",
                    },
                    {
                        name: "Ameya-Yokocho Market",
                        description: "Bustling outdoor market with street food, fresh seafood, and bargain goods",
                        category: "food",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 35.7114, lng: 139.7741 },
                        address: "4 Chome Ueno, Taito City, Tokyo, Japan",
                    },
                ],
            },
            {
                day: 4,
                theme: "Tsukiji, Ginza & Odaiba",
                places: [
                    {
                        name: "Tsukiji Outer Market",
                        description: "Bustling food market with the freshest sushi, tamagoyaki, and street food in Tokyo",
                        category: "food",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "morning",
                        coordinates: { lat: 35.6654, lng: 139.7706 },
                        address: "4 Chome Tsukiji, Chuo City, Tokyo, Japan",
                    },
                    {
                        name: "Ginza District",
                        description: "Tokyo's most upscale shopping and dining district with department stores and galleries",
                        category: "shopping",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.6717, lng: 139.7650 },
                        address: "Ginza, Chuo City, Tokyo, Japan",
                    },
                    {
                        name: "teamLab Borderless",
                        description: "Immersive digital art museum where artworks move, interact, and blend without boundaries",
                        category: "museum",
                        estimatedTimeHours: 2,
                        bestTimeOfDay: "afternoon",
                        coordinates: { lat: 35.6252, lng: 139.7741 },
                        address: "Azabudai Hills Garden Plaza B, Minato City, Tokyo 106-0041, Japan",
                    },
                    {
                        name: "Tokyo Tower",
                        description: "Iconic lattice tower inspired by the Eiffel Tower, offering spectacular night views",
                        category: "sightseeing",
                        estimatedTimeHours: 1.5,
                        bestTimeOfDay: "evening",
                        coordinates: { lat: 35.6586, lng: 139.7454 },
                        address: "4-2-8 Shibakoen, Minato City, Tokyo 105-0011, Japan",
                    },
                ],
            },
        ],
        discoveredPlaces: [],
    },
];

import { getRoutesForItinerary } from "./services/routingService.js";
import { uploadPlacePhotos } from "./services/r2Service.js";
import { lookupPlacesByLocations } from "./services/placesService.js";

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Clear existing template trips
        const deleted = await TemplateTrip.deleteMany({});

        // Generate images and routes for all template trips
        for (let i = 0; i < TEMPLATE_TRIPS.length; i++) {
            const trip = TEMPLATE_TRIPS[i];
          
            // Extract country and city from destination (e.g., "Rome, Italy" -> City: "Rome", Country: "Italy")
            const destParts = trip.destination.split(",").map(p => p.trim());
            const city = destParts[0];
            const country = destParts.length > 1 ? destParts[1] : "";

            // Gather all spot names
            const allSpots = [];
            trip.itinerary.forEach(day => {
                day.places.forEach(place => {
                    allSpots.push(place.name);
                });
            });

            // Format for lookupPlacesByLocations
            const locations = [{
                country,
                city,
                spots: allSpots
            }];

            // Fetch places to get images (and triggers background R2 upload)
            const resolvedPlaces = await lookupPlacesByLocations(
                locations,
                (msg) => {} // progress callback
            );

            // Wait for R2 photos to actually finish uploading so the template trips get permanent URLs!
            await uploadPlacePhotos(resolvedPlaces);

            // Create a lookup map for fast matching: spotName -> photoUrl and full Place
            const placeImageMap = {};
            resolvedPlaces.forEach(p => {
                if (p.photoUrl) {
                    // Try to match on exact name; Places API might alter it slightly, but usually it matches
                    placeImageMap[p.name.toLowerCase()] = p.photoUrl; 
                }
            });
            
            // Set discoveredPlaces so it matches user-generated trips verbatim
            trip.discoveredPlaces = resolvedPlaces;

            // Attach photoUrls back to the original template trip places
            let addedPhotos = 0;
            trip.itinerary.forEach(day => {
                day.places.forEach(place => {
                    const matchName = place.name.toLowerCase();
                    // Some basic fuzzy matching in case the API returns slightly different names
                    const foundKey = Object.keys(placeImageMap).find(k => k.includes(matchName) || matchName.includes(k));
                    
                    if (foundKey) {
                        place.photoUrl = placeImageMap[foundKey];
                        addedPhotos++;
                    }
                });
            });
           
            // Adapt the trip itinerary to the format expected by getRoutesForItinerary
            const planToRoute = {
                destination: trip.destination,
                itinerary: trip.itinerary
            };

            // Fetch routes
            const routedPlan = await getRoutesForItinerary(planToRoute);
            
            // Re-assign the routed itinerary back to the template trip
            TEMPLATE_TRIPS[i].itinerary = routedPlan.itinerary;
        }

        // Insert new template trips
        const inserted = await TemplateTrip.insertMany(TEMPLATE_TRIPS);
        inserted.forEach((t) => {
        });

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed failed:", err.message);
        process.exit(1);
    }
}

seed();
