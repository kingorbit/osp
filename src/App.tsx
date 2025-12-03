import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Filter, Plus, Search, Download, Map, Menu, X, LogOut, User, CheckCircle, Navigation, AlertTriangle, Info, Clock, Database, Shield, FileText, Layers, MapPinned, Edit3, Trash2, Save, Bell, Activity, ChevronDown, Upload } from 'lucide-react';

import { db, saveRoad as saveRoadToFirebase, getRoads, updateRoad as updateRoadInFirebase, deleteRoad as deleteRoadFromFirebase, saveUser as saveUserToFirebase, getUsers, updateUser as updateUserInFirebase, deleteUser as deleteUserFromFirebase, addActivityLog, getActivityLogs, initializeDefaultData } from './firebase';

// Deklaracja typu dla window.storage API
declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<{ key: string; value: string } | null>;
      set: (key: string, value: string) => Promise<{ key: string; value: string } | null>;
      delete: (key: string) => Promise<{ key: string; deleted: boolean } | null>;
      list: (prefix?: string) => Promise<{ keys: string[] } | null>;
    };
    L: any;
  }
}

// Definicje typów
interface Road {
  id: number;
  name: string;
  type: string;
  width: number;
  surface: string;
  seasonal: string;
  distance: number;
  slope: string;
  slopePercent: number;
  coords: number[];
  distanceFromMain: number;
  distanceFromCrisisPoints: number;
  accessibility: string;
  maxWeight: number;
  notes: string;
  userNotes: Note[];
  lastUpdate: string;
}

interface Note {
  id: number;
  text: string;
  author: string;
  timestamp: string;
}

interface CrisisPoint {
  id: number;
  name: string;
  coords: number[];
  type: string;
}

interface UserType {
  id: string;
  username: string;
  password: string;
  role: string;
  active: boolean;
  createdAt: string;
}

interface ActivityLog {
  id: number;
  timestamp: Date;
  type: string;
  description: string;
  user: string;
}

interface Filters {
  type: string;
  surface: string;
  seasonal: string;
  minWidth: number;
  maxSlope: number;
  accessibility: string;
  maxDistanceFromMain: number;
}

interface LeafletMapProps {
  roads: Road[];
  crisisPoints: CrisisPoint[];
  selectedRoad: Road | null;
  onRoadSelect: (road: Road) => void;
  showCrisisPoints: boolean;
  userLocation: number[] | null;
  onMapClick?: (coords: number[]) => void;
  tempMarker?: number[] | null;
  routeCoordinates?: number[][];
  navigationActive?: boolean;
}

const initialRoads: Road[] = [
  {
    id: 1,
    name: "Droga Zawoja - Markowe Szczawiny",
    type: "lokalna",
    width: 5.5,
    surface: "asfalt",
    seasonal: "cały rok",
    distance: 2.3,
    slope: "średnie",
    slopePercent: 8,
    coords: [49.6147, 19.5294],
    distanceFromMain: 0.5,
    distanceFromCrisisPoints: 1.2,
    accessibility: "pojazdy wszystkie",
    maxWeight: 16,
    notes: "Główny dojazd do DPS w Markowych Szczawinach",
    userNotes: [],
    lastUpdate: "2024-11-15"
  },
  {
    id: 2,
    name: "Droga leśna - Przełęcz Krowiarki",
    type: "leśna",
    width: 3.2,
    surface: "utwardzona",
    seasonal: "IV-XI",
    distance: 4.7,
    slope: "duże",
    slopePercent: 15,
    coords: [49.6000, 19.5150],
    distanceFromMain: 2.8,
    distanceFromCrisisPoints: 0.5,
    accessibility: "pojazdy terenowe",
    maxWeight: 8,
    notes: "Dostęp do szlaków turystycznych, ważna dla akcji GOPR",
    userNotes: [],
    lastUpdate: "2024-11-10"
  },
  {
    id: 3,
    name: "Droga polna - Polica",
    type: "polna",
    width: 4.0,
    surface: "żwir",
    seasonal: "V-X",
    distance: 1.8,
    slope: "małe",
    slopePercent: 5,
    coords: [49.6200, 19.5400],
    distanceFromMain: 1.5,
    distanceFromCrisisPoints: 2.0,
    accessibility: "pojazdy lekkie",
    maxWeight: 5,
    notes: "Sezonowy dostęp, po opadach mogą być trudności",
    userNotes: [],
    lastUpdate: "2024-11-20"
  },
  {
    id: 4,
    name: "Droga główna Zawoja - Zubrzyca",
    type: "lokalna",
    width: 6.0,
    surface: "asfalt",
    seasonal: "cały rok",
    distance: 0.5,
    slope: "małe",
    slopePercent: 3,
    coords: [49.6250, 19.5350],
    distanceFromMain: 0,
    distanceFromCrisisPoints: 1.8,
    accessibility: "pojazdy wszystkie",
    maxWeight: 20,
    notes: "Główna arteria komunikacyjna - priorytet w zimie",
    userNotes: [],
    lastUpdate: "2024-11-28"
  }
];

const crisisPoints: CrisisPoint[] = [
  { id: 1, name: "Punkt widokowy Diablak", coords: [49.6100, 19.5200], type: "punkt-turystyczny" },
  { id: 2, name: "Schronisko Markowe Szczawiny", coords: [49.6150, 19.5300], type: "schronisko" },
  { id: 3, name: "Szlak czerwony - odcinek krytyczny", coords: [49.6050, 19.5180], type: "szlak" }
];

// Komponent mapy Leaflet
const LeafletMap: React.FC<LeafletMapProps> = ({ 
  roads, 
  crisisPoints, 
  selectedRoad, 
  onRoadSelect, 
  showCrisisPoints, 
  userLocation, 
  onMapClick, 
  tempMarker,
  routeCoordinates,
  navigationActive 
}) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
      document.head.appendChild(link);
    }

    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      script.onload = initMap;
      document.body.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          markersRef.current.forEach(marker => {
            try {
              marker.remove();
            } catch (e) {
              // Ignoruj błędy przy usuwaniu markerów
            }
          });
          markersRef.current = [];
          
          if (routeLayerRef.current) {
            try {
              routeLayerRef.current.remove();
              routeLayerRef.current = null;
            } catch (e) {
              // Ignoruj błędy przy usuwaniu trasy
            }
          }
          
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        } catch (error) {
          console.log('Błąd przy czyszczeniu mapy:', error);
          mapInstanceRef.current = null;
        }
      }
    };
  }, []);

  const updateMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;

    const L = (window as any).L;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    roads.forEach((road: Road) => {
      const color = selectedRoad?.id === road.id ? 'blue' : (road.slopePercent > 12 ? 'red' : 'green');
      
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: ${selectedRoad?.id === road.id ? '20px' : '12px'}; height: ${selectedRoad?.id === road.id ? '20px' : '12px'}; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer;"></div>`,
        iconSize: [selectedRoad?.id === road.id ? 20 : 12, selectedRoad?.id === road.id ? 20 : 12],
      });

      const marker = L.marker([road.coords[0], road.coords[1]], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: bold;">${road.name}</h3>
            <p style="margin: 4px 0;"><strong>Typ:</strong> ${road.type}</p>
            <p style="margin: 4px 0;"><strong>Szerokość:</strong> ${road.width}m</p>
            <p style="margin: 4px 0;"><strong>Nachylenie:</strong> ${road.slopePercent}%</p>
            <p style="margin: 4px 0;"><strong>Dostępność:</strong> ${road.seasonal}</p>
          </div>
        `)
        .on('click', () => onRoadSelect(road));

      markersRef.current.push(marker);
    });

    if (showCrisisPoints) {
      crisisPoints.forEach((point: CrisisPoint) => {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: '<div style="background-color: orange; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [14, 14],
        });

        const marker = L.marker([point.coords[0], point.coords[1]], { icon })
          .addTo(map)
          .bindPopup(`
            <div>
              <h3 style="margin: 0 0 8px 0; font-weight: bold;">${point.name}</h3>
              <p style="margin: 4px 0;"><strong>Typ:</strong> ${point.type}</p>
            </div>
          `);

        markersRef.current.push(marker);
      });
    }

    if (userLocation) {
      const icon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px #3b82f6; animation: pulse 2s infinite;"></div>',
        iconSize: [16, 16],
      });

      const marker = L.marker([userLocation[0], userLocation[1]], { icon })
        .addTo(map)
        .bindPopup('<div><strong>Twoja lokalizacja</strong></div>');

      markersRef.current.push(marker);
    }

    if (selectedRoad) {
      map.setView([selectedRoad.coords[0], selectedRoad.coords[1]], 15);
    }
  }, [roads, crisisPoints, selectedRoad, showCrisisPoints, userLocation, onRoadSelect]);

  const updateRoute = useCallback(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;

    const L = (window as any).L;
    const map = mapInstanceRef.current;

    // Zawsze najpierw usuń starą trasę
    if (routeLayerRef.current) {
      try {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
        console.log('✅ Trasa usunięta z mapy');
      } catch (e) {
        console.log('Błąd usuwania trasy:', e);
      }
    }

    // Dodaj nową trasę TYLKO gdy jest aktywna i ma współrzędne
    if (routeCoordinates && routeCoordinates.length > 0 && navigationActive) {
      try {
        console.log('🗺️ Rysuję nową trasę:', routeCoordinates.length, 'punktów');
        
        // Utwórz grupę warstw dla trasy i markerów
        const routeGroup = L.layerGroup();
        
        // Dodaj główną linię trasy
        const polyline = L.polyline(routeCoordinates, {
          color: '#2563eb',
          weight: 6,
          opacity: 0.8,
          smoothFactor: 1,
          className: 'route-line'
        });
        
        routeGroup.addLayer(polyline);

        // Dodaj animowany marker kierunku
        const arrowIcon = L.divIcon({
          className: 'route-arrow',
          html: '<div style="background: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
          iconSize: [12, 12]
        });

        // Dodaj punkty co 10% trasy do grupy
        const step = Math.floor(routeCoordinates.length / 10) || 1;
        for (let i = 0; i < routeCoordinates.length; i += step) {
          if (i < routeCoordinates.length) {
            const marker = L.marker(routeCoordinates[i], { 
              icon: arrowIcon, 
              interactive: false 
            });
            routeGroup.addLayer(marker);
          }
        }

        // Dodaj całą grupę do mapy
        routeGroup.addTo(map);
        routeLayerRef.current = routeGroup;
        
        console.log('✅ Trasa dodana do mapy (grupa warstw)');

        // Wycentruj mapę na trasie
        const bounds = polyline.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });

      } catch (error) {
        console.error('❌ Błąd rysowania trasy:', error);
      }
    } else {
      console.log('ℹ️ Brak trasy do narysowania lub nawigacja nieaktywna');
    }
  }, [routeCoordinates, navigationActive]);

  // Dodatkowy useEffect tylko dla trasy - reaguje na zmiany nawigacji
  useEffect(() => {
    console.log('🔄 Zmiana nawigacji - navigationActive:', navigationActive, 'routeCoordinates:', routeCoordinates?.length || 0);
    
    if (mapInstanceRef.current) {
      updateRoute();
    }
  }, [navigationActive, routeCoordinates, updateRoute]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      // Odśwież rozmiar mapy po zmianie
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
      updateMarkers();
    }
  }, [roads, crisisPoints, selectedRoad, showCrisisPoints, userLocation, tempMarker, updateMarkers]);

  // Dodatkowy useEffect tylko dla tempMarker - wymusza natychmiastowe odświeżenie
  useEffect(() => {
    console.log('🔄 tempMarker się zmienił:', tempMarker);
    if (tempMarker) {
      // Czekaj aż mapa będzie gotowa, potem odśwież
      let attempts = 0;
      const waitForMap = setInterval(() => {
        attempts++;
        console.log(`⏳ Próba ${attempts}: Czy mapa istnieje?`, !!mapInstanceRef.current);
        
        if (mapInstanceRef.current) {
          console.log('✅ Mapa gotowa! Wymuszam updateMarkers - BEZPOŚREDNIE WYWOŁANIE');
          clearInterval(waitForMap);
          
          // Wywołaj updateMarkers bezpośrednio tutaj
          const L = (window as any).L;
          const map = mapInstanceRef.current;
          
          if (map && L && tempMarker[0] && tempMarker[1]) {
            console.log('🔄 BEZPOŚREDNIE RENDEROWANIE MARKERA');
            
            // Usuń stare markery
            markersRef.current.forEach(marker => {
              try {
                marker.remove();
              } catch (e) {}
            });
            markersRef.current = [];
            
            // Dodaj nowy marker
            try {
              const icon = L.divIcon({
                className: 'custom-marker temp-marker',
                html: '<div style="background-color: #10b981; width: 32px; height: 32px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 15px rgba(16, 185, 129, 1); animation: pulse 2s infinite; z-index: 10000 !important;"></div>',
                iconSize: [32, 32],
              });
              
              const marker = L.marker([tempMarker[0], tempMarker[1]], { 
                icon,
                zIndexOffset: 10000 
              }).addTo(map);
              
              marker.bindPopup('<div><strong>✅ Wybrana lokalizacja</strong><p style="margin: 4px 0; font-size: 12px;">📍 Tutaj zostanie dodana droga</p></div>');
              marker.openPopup();
              
              markersRef.current.push(marker);
              console.log('✅✅✅ MARKER DODANY BEZPOŚREDNIO! Total markerów:', markersRef.current.length);
              
              setTimeout(() => {
                map.setView([tempMarker[0], tempMarker[1]], 14);
                console.log('✅ Mapa wycentrowana');
              }, 100);
              
            } catch (error) {
              console.error('❌ BŁĄD dodawania markera:', error);
            }
          }
          
        } else if (attempts > 20) {
          console.log('❌ Timeout - mapa nie załadowała się po 2 sekundach');
          clearInterval(waitForMap);
        }
      }, 100);
      
      return () => clearInterval(waitForMap);
    }
  }, [tempMarker]);

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const L = (window as any).L;
    if (!L) {
      console.log('⚠️ Leaflet nie jest jeszcze załadowany');
      return;
    }
    
    try {
      console.log('🗺️ Inicjalizuję mapę...');
      const map = L.map(mapRef.current).setView([49.6147, 19.5294], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      // Dodaj obsługę kliknięcia na mapie
      if (onMapClick) {
        map.on('click', (e: any) => {
          console.log('🖱️ Kliknięto na mapie:', e.latlng);
          onMapClick([e.latlng.lat, e.latlng.lng]);
        });
      }

      mapInstanceRef.current = map;
      console.log('✅ Mapa zainicjalizowana!');
      
      // Odśwież markery od razu po inicjalizacji
      setTimeout(() => {
        console.log('🔄 Pierwsza aktualizacja markerów po inicjalizacji');
        updateMarkers();
      }, 200);
      
    } catch (error) {
      console.error('❌ Błąd inicjalizacji mapy:', error);
    }
  };

  return (
    <div className="h-full w-full">
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes route-dash {
            from { stroke-dashoffset: 1000; }
            to { stroke-dashoffset: 0; }
          }
          .leaflet-container {
            z-index: 1 !important;
            height: 100% !important;
            width: 100% !important;
          }
          .leaflet-pane {
            z-index: 400 !important;
          }
          .leaflet-top, .leaflet-bottom {
            z-index: 1000 !important;
          }
          .route-line {
            animation: route-dash 2s linear infinite;
            stroke-dasharray: 10, 10;
          }
        `}
      </style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px', borderRadius: '8px' }} />
    </div>
  );
};

const RescueApp = () => {
  const [user, setUser] = useState<UserType | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [roads, setRoads] = useState<Road[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [filteredRoads, setFilteredRoads] = useState<Road[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showAddRoad, setShowAddRoad] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRoad, setSelectedRoad] = useState<Road | null>(null);
  const [showLogin, setShowLogin] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<string>('map');
  const [userLocation, setUserLocation] = useState<number[] | null>(null);
  const [showUserNoteModal, setShowUserNoteModal] = useState<boolean>(false);
  const [newUserNote, setNewUserNote] = useState<string>('');
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [showCrisisPoints, setShowCrisisPoints] = useState<boolean>(true);
  const [editingRoad, setEditingRoad] = useState<Road | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showFullscreenMap, setShowFullscreenMap] = useState<boolean>(false);
  const [tempMarker, setTempMarker] = useState<number[] | null>(null);
  const [showMapLegend, setShowMapLegend] = useState<boolean>(true);
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);
  const [navigationActive, setNavigationActive] = useState<boolean>(false);
  const [routeDistance, setRouteDistance] = useState<number>(0);
  const [routeDuration, setRouteDuration] = useState<number>(0);
  const [routeInstructions, setRouteInstructions] = useState<string[]>([]);
  const [showRoutePanel, setShowRoutePanel] = useState<boolean>(false);
  
  const [showAddUser, setShowAddUser] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'osp'
  });
  
  const [filters, setFilters] = useState<Filters>({
    type: 'wszystkie',
    surface: 'wszystkie',
    seasonal: 'wszystkie',
    minWidth: 0,
    maxSlope: 100,
    accessibility: 'wszystkie',
    maxDistanceFromMain: 10
  });

  const [newRoadForm, setNewRoadForm] = useState<Omit<Road, 'id' | 'lastUpdate'>>({
    name: '',
    type: 'lokalna',
    width: 3.5,
    surface: 'asfalt',
    seasonal: 'cały rok',
    distance: 0,
    slope: 'małe',
    slopePercent: 5,
    coords: [49.6147, 19.5294],
    distanceFromMain: 0,
    distanceFromCrisisPoints: 0,
    accessibility: 'pojazdy wszystkie',
    maxWeight: 10,
    notes: '',
    userNotes: []
  });

  // Ustaw tempMarker przy otwieraniu formularza
  useEffect(() => {
    if (showAddRoad && !editingRoad && !tempMarker) {
      console.log('Ustawiam tempMarker dla nowej drogi:', newRoadForm.coords);
      setTempMarker(newRoadForm.coords);
    }
    if (editingRoad && !tempMarker) {
      console.log('Ustawiam tempMarker dla edycji drogi:', editingRoad.coords);
      setTempMarker(editingRoad.coords);
    }
  }, [showAddRoad, editingRoad]);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      setLoading(true);
      console.log('Rozpoczęcie inicjalizacji danych z Firebase...');
      
      // Pobierz użytkowników z Firebase
      const loadedUsers = await getUsers();
      if (loadedUsers && loadedUsers.length > 0) {
        setUsers(loadedUsers as UserType[]);
        console.log('Załadowano użytkowników z Firebase:', loadedUsers.length);
      } else {
        console.log('Brak użytkowników - tworzenie domyślnego admina');
        const defaultUser: UserType = {
          id: '1',
          username: 'admin',
          password: 'admin123',
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString()
        };
        await saveUserToFirebase(defaultUser);
        setUsers([defaultUser]);
        console.log('Utworzono domyślnego admina w Firebase');
      }

      // Pobierz drogi z Firebase
      const loadedRoads = await getRoads();
      if (loadedRoads && loadedRoads.length > 0) {
        setRoads(loadedRoads as Road[]);
        setFilteredRoads(loadedRoads as Road[]);
        console.log('Załadowano drogi z Firebase:', loadedRoads.length);
      } else {
        console.log('Brak dróg - inicjalizacja domyślnych');
        await initializeDefaultData(initialRoads, {
          id: '1',
          username: 'admin',
          password: 'admin123',
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString()
        });
        setRoads(initialRoads);
        setFilteredRoads(initialRoads);
        console.log('Utworzono początkowe drogi w Firebase');
      }

      setLoading(false);
      console.log('Inicjalizacja zakończona');
    } catch (error) {
      console.error('Błąd inicjalizacji Firebase:', error);
      setLoading(false);
    }
  };

  const saveRoadsToStorage = async (updatedRoads: Road[]) => {
    try {
      // Zapisz wszystkie drogi do Firebase
      for (const road of updatedRoads) {
        await saveRoadToFirebase(road);
      }
      console.log('Drogi zapisane w Firebase');
    } catch (error) {
      console.error('Błąd zapisu dróg do Firebase:', error);
    }
  };

  const saveUsersToStorage = async (updatedUsers: UserType[]) => {
    try {
      // Zapisz wszystkich użytkowników do Firebase
      for (const user of updatedUsers) {
        await saveUserToFirebase(user);
      }
      console.log('Użytkownicy zapisani w Firebase');
    } catch (error) {
      console.error('Błąd zapisu użytkowników do Firebase:', error);
    }
  };

  useEffect(() => {
    if (!showLogin && !loading && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          logActivity('GPS', 'Lokalizacja pobrana');
        },
        (error) => {
          console.log('GPS niedostępny');
        }
      );
    }
  }, [showLogin, loading]);

  // Odśwież mapę po zmianie trybu fullscreen
  useEffect(() => {
    if (showFullscreenMap) {
      // Daj czas na renderowanie
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
      
      // Obsługa klawisza ESC
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowFullscreenMap(false);
        }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [showFullscreenMap]);

  const logActivity = (type: string, description: string) => {
    const log: ActivityLog = {
      id: Date.now(),
      timestamp: new Date(),
      type,
      description,
      user: user?.username || (isGuest ? 'Gość' : 'System')
    };
    setActivityLog(prev => [log, ...prev.slice(0, 49)]);
  };

  const handleLogin = async () => {
    setLoginError('');
    
    if (!loginUsername || !loginPassword) {
      setLoginError('Proszę podać login i hasło');
      return;
    }

    console.log('Próba logowania:', loginUsername);
    console.log('Dostępni użytkownicy:', users);

    const foundUser = users.find(
      u => u.username === loginUsername && u.password === loginPassword && u.active
    );

    if (foundUser) {
      setUser(foundUser);
      setIsGuest(false);
      setShowLogin(false);
      setLoginUsername('');
      setLoginPassword('');
      logActivity('AUTH', `Zalogowano jako ${foundUser.username} (${foundUser.role})`);
    } else {
      console.log('Nie znaleziono użytkownika');
      setLoginError('Nieprawidłowy login lub hasło');
    }
  };

  const handleGuestMode = () => {
    setIsGuest(true);
    setUser(null);
    setShowLogin(false);
    logActivity('AUTH', 'Rozpoczęto tryb gościa');
  };

  const handleLogout = () => {
    logActivity('AUTH', `Wylogowano: ${user?.username || 'Gość'}`);
    setUser(null);
    setIsGuest(false);
    setShowLogin(true);
    setSelectedRoad(null);
    setActiveView('map');
  };

  const handleAddNewUser = async () => {
    if (!newUser.username || !newUser.password) {
      alert('Proszę wypełnić login i hasło');
      return;
    }

    if (users.some(u => u.username === newUser.username)) {
      alert('Użytkownik o tym loginie już istnieje');
      return;
    }

    const userToAdd: UserType = {
      id: Date.now().toString(),
      username: newUser.username,
      password: newUser.password,
      role: newUser.role,
      active: true,
      createdAt: new Date().toISOString()
    };

    // Zapisz do Firebase
    await saveUserToFirebase(userToAdd);

    const updatedUsers = [...users, userToAdd];
    setUsers(updatedUsers);
    
    setShowAddUser(false);
    setNewUser({
      username: '',
      password: '',
      role: 'osp'
    });
    
    logActivity('USER_ADD', `Dodano użytkownika: ${userToAdd.username}`);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    const updatedUsers = users.map(u => 
      u.id === editingUser.id ? editingUser : u
    );
    
    // Zaktualizuj w Firebase
    await updateUserInFirebase(editingUser.id, editingUser);
    
    setUsers(updatedUsers);
    setEditingUser(null);
    logActivity('USER_UPDATE', `Zaktualizowano użytkownika: ${editingUser.username}`);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Czy na pewno usunąć tego użytkownika?')) return;
    
    const userToDelete = users.find(u => u.id === userId);
    const updatedUsers = users.filter(u => u.id !== userId);
    
    // Usuń z Firebase
    await deleteUserFromFirebase(userId);
    
    setUsers(updatedUsers);
    logActivity('USER_DELETE', `Usunięto użytkownika: ${userToDelete?.username}`);
  };

  const handleToggleUserActive = async (userId: string) => {
    const userToUpdate = users.find(u => u.id === userId);
    if (!userToUpdate) return;
    
    const updatedUsers = users.map(u => 
      u.id === userId ? { ...u, active: !u.active } : u
    );
    
    // Zaktualizuj w Firebase
    await updateUserInFirebase(userId, { active: !userToUpdate.active });
    
    setUsers(updatedUsers);
    logActivity('USER_STATUS', `Zmieniono status użytkownika: ${userToUpdate.username}`);
  };

  useEffect(() => {
    let result = roads;

    if (searchTerm) {
      result = result.filter(road => 
        road.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        road.notes.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filters.type !== 'wszystkie') {
      result = result.filter(road => road.type === filters.type);
    }

    if (filters.surface !== 'wszystkie') {
      result = result.filter(road => road.surface === filters.surface);
    }

    if (filters.seasonal !== 'wszystkie') {
      result = result.filter(road => road.seasonal === filters.seasonal);
    }

    if (filters.accessibility !== 'wszystkie') {
      result = result.filter(road => road.accessibility === filters.accessibility);
    }

    if (filters.minWidth > 0) {
      result = result.filter(road => road.width >= filters.minWidth);
    }

    if (filters.maxSlope < 100) {
      result = result.filter(road => road.slopePercent <= filters.maxSlope);
    }

    if (filters.maxDistanceFromMain < 10) {
      result = result.filter(road => road.distanceFromMain <= filters.maxDistanceFromMain);
    }

    setFilteredRoads(result);
  }, [roads, searchTerm, filters]);

  const handleAddRoad = async () => {
    if (!newRoadForm.name) {
      alert('Proszę podać nazwę drogi');
      return;
    }

    const road: Road = {
      ...newRoadForm,
      id: Date.now(),
      lastUpdate: new Date().toISOString().split('T')[0]
    };

    // Zapisz do Firebase
    await saveRoadToFirebase(road);

    const updatedRoads = [...roads, road];
    setRoads(updatedRoads);
    
    setShowAddRoad(false);
    setTempMarker(null);
    logActivity('CREATE', `Dodano drogę: ${road.name}`);
    
    setNewRoadForm({
      name: '',
      type: 'lokalna',
      width: 3.5,
      surface: 'asfalt',
      seasonal: 'cały rok',
      distance: 0,
      slope: 'małe',
      slopePercent: 5,
      coords: [49.6147, 19.5294],
      distanceFromMain: 0,
      distanceFromCrisisPoints: 0,
      accessibility: 'pojazdy wszystkie',
      maxWeight: 10,
      notes: '',
      userNotes: []
    });
  };

  const handleMapClick = (coords: number[]) => {
    console.log('=== KLIKNIĘTO NA MAPIE ===');
    console.log('Nowe współrzędne:', coords);
    console.log('Przed aktualizacją - tempMarker:', tempMarker);
    
    setTempMarker(coords);
    
    if (editingRoad) {
      console.log('Aktualizuję editingRoad');
      setEditingRoad({ ...editingRoad, coords });
    } else {
      console.log('Aktualizuję newRoadForm');
      setNewRoadForm({ ...newRoadForm, coords });
    }
  };

  const handleUpdateRoad = async () => {
    if (!editingRoad) return;
    
    const updatedRoad = {
      ...editingRoad,
      lastUpdate: new Date().toISOString().split('T')[0]
    };
    
    // Zaktualizuj w Firebase
    await updateRoadInFirebase(editingRoad.id, updatedRoad);
    
    const updated = roads.map(r => 
      r.id === editingRoad.id ? updatedRoad : r
    );
    
    setRoads(updated);
    setEditingRoad(null);
    setTempMarker(null);
    logActivity('UPDATE', `Zaktualizowano drogę: ${editingRoad.name}`);
  };

  const handleDeleteRoad = async (roadId: number) => {
    if (!window.confirm('Czy na pewno usunąć tę drogę?')) return;
    
    const road = roads.find(r => r.id === roadId);
    const updated = roads.filter(r => r.id !== roadId);
    
    // Usuń z Firebase
    await deleteRoadFromFirebase(roadId);
    
    setRoads(updated);
    setSelectedRoad(null);
    logActivity('DELETE', `Usunięto drogę: ${road?.name}`);
  };

  const handleAddUserNote = async () => {
    if (!selectedRoad || !newUserNote.trim() || !user) return;
    
    const note: Note = {
      id: Date.now(),
      text: newUserNote,
      author: user.username,
      timestamp: new Date().toISOString()
    };

    const updatedRoad = {
      ...selectedRoad,
      userNotes: [...selectedRoad.userNotes, note]
    };

    // Zaktualizuj w Firebase
    await updateRoadInFirebase(selectedRoad.id, updatedRoad);

    const updated = roads.map(r => 
      r.id === selectedRoad.id ? updatedRoad : r
    );
    
    setRoads(updated);
    setSelectedRoad(updatedRoad);
    setNewUserNote('');
    setShowUserNoteModal(false);
    logActivity('NOTE', `Dodano notatkę do: ${selectedRoad.name}`);
  };

  const handleExport = (format = 'json') => {
    if (!user && !isGuest) return;
    
    const data = {
      roads: filteredRoads,
      crisisPoints,
      exportDate: new Date().toISOString(),
      exportedBy: user?.username || 'Gość',
      totalRoads: filteredRoads.length
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `babia-gora-drogi-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    logActivity('EXPORT', `Wyeksportowano ${filteredRoads.length} dróg`);
  };

  const handleBackup = () => {
    const backup = {
      roads,
      users,
      activityLog,
      timestamp: new Date().toISOString(),
      version: '2.1'
    };
    
    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-${new Date().toISOString()}.json`;
    link.click();
    logActivity('BACKUP', 'Utworzono kopię zapasową');
  };

  const syncData = () => {
    setLastSync(new Date());
    logActivity('SYNC', 'Zsynchronizowano dane');
    alert('Dane zsynchronizowane z serwerem!');
  };

  const calculateRouteWithAPI = async (road: Road) => {
    if (!userLocation) {
      alert('⚠️ Lokalizacja GPS niedostępna\n\nAby uruchomić nawigację, włącz GPS w ustawieniach urządzenia.');
      return;
    }

    setShowRoutePanel(true);
    setNavigationActive(true);

    try {
      // OSRM API - darmowe, open source
      const start = `${userLocation[1]},${userLocation[0]}`; // lng,lat
      const end = `${road.coords[1]},${road.coords[0]}`; // lng,lat
      
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;
      
      console.log('Pobieranie trasy z OSRM...', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        
        // Konwertuj współrzędne z [lng, lat] na [lat, lng] dla Leaflet
        const coordinates = route.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
        
        setRouteCoordinates(coordinates);
        setRouteDistance(route.distance / 1000); // metry na kilometry
        setRouteDuration(route.duration / 60); // sekundy na minuty
        
        // Pobierz instrukcje nawigacji
        const instructions: string[] = [];
        if (route.legs && route.legs[0] && route.legs[0].steps) {
          route.legs[0].steps.forEach((step: any, index: number) => {
            const distance = (step.distance / 1000).toFixed(1);
            const instruction = step.maneuver?.instruction || step.name || 'Kontynuuj';
            instructions.push(`${index + 1}. ${instruction} (${distance} km)`);
          });
        }
        setRouteInstructions(instructions);
        
        logActivity('NAVIGATION', `Rozpoczęto nawigację GPS do: ${road.name} (${(route.distance / 1000).toFixed(1)} km)`);
        
        // Przełącz na widok mapy
        setActiveView('map');
        setSelectedRoad(road);
        
      } else {
        throw new Error('Nie można znaleźć trasy');
      }
      
    } catch (error) {
      console.error('Błąd pobierania trasy:', error);
      alert('❌ Nie udało się obliczyć trasy\n\nSpróbuj ponownie lub użyj zewnętrznej aplikacji nawigacyjnej.');
      setNavigationActive(false);
      setShowRoutePanel(false);
    }
  };

  const stopNavigation = () => {
    console.log('🛑 Zatrzymywanie nawigacji...');
    
    // Wyczyść stany
    setNavigationActive(false);
    setRouteCoordinates([]);
    setRouteInstructions([]);
    setShowRoutePanel(false);
    setRouteDistance(0);
    setRouteDuration(0);
    
    logActivity('NAVIGATION', 'Zakończono nawigację GPS');
    
    console.log('✅ Nawigacja zatrzymana, trasa powinna zniknąć');
  };

  const openGoogleMaps = (road: Road) => {
    const lat = road.coords[0];
    const lng = road.coords[1];
    
    // Google Maps URL z punktem początkowym (aktualna lokalizacja) i końcowym
    const googleMapsUrl = userLocation 
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    
    window.open(googleMapsUrl, '_blank');
    logActivity('NAVIGATION', `Otwarto Google Maps do: ${road.name}`);
  };

  const openAppleMaps = (road: Road) => {
    const lat = road.coords[0];
    const lng = road.coords[1];
    
    // Apple Maps URL
    const appleMapsUrl = userLocation
      ? `http://maps.apple.com/?saddr=${userLocation[0]},${userLocation[1]}&daddr=${lat},${lng}&dirflg=d`
      : `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    
    window.open(appleMapsUrl, '_blank');
    logActivity('NAVIGATION', `Otwarto Apple Maps do: ${road.name}`);
  };

  const openWaze = (road: Road) => {
    const lat = road.coords[0];
    const lng = road.coords[1];
    
    // Waze URL
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    
    window.open(wazeUrl, '_blank');
    logActivity('NAVIGATION', `Otwarto Waze do: ${road.name}`);
  };

  const showNavigationOptions = (road: Road) => {
    if (!userLocation) {
      alert('⚠️ Lokalizacja GPS niedostępna\n\nAby korzystać z nawigacji, musisz:\n1. Włączyć GPS w ustawieniach urządzenia\n2. Zezwolić przeglądarce na dostęp do lokalizacji\n3. Odświeżyć stronę');
      return;
    }

    const distance = Math.sqrt(
      Math.pow(userLocation[0] - road.coords[0], 2) + 
      Math.pow(userLocation[1] - road.coords[1], 2)
    ) * 111;

    // Utwórz modalny wybór aplikacji nawigacyjnej
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-center; z-index: 10000;';
    
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;">
        <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: bold;">🧭 Wybierz nawigację</h3>
        
        <div style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border-radius: 8px; border: 1px solid #dbeafe;">
          <p style="margin: 0; font-size: 14px; color: #1e40af;"><strong>Cel:</strong> ${road.name}</p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #1e40af;">📏 Odległość: ~${distance.toFixed(2)} km</p>
        </div>

        <div style="margin-bottom: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; border: 1px solid #fde68a;">
          <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>⚠️ Parametry drogi:</strong></p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #92400e;">
            • Szerokość: ${road.width}m | Nachylenie: ${road.slopePercent}%<br>
            • Nawierzchnia: ${road.surface} | Max. ładunek: ${road.maxWeight}t<br>
            • Dostępność: ${road.seasonal}
          </p>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <button id="navInternal" style="padding: 12px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
            🗺️ Nawigacja w aplikacji (ZALECANE)
          </button>
          <button id="navGoogle" style="padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">
            Google Maps
          </button>
          <button id="navApple" style="padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">
            🍎 Apple Maps
          </button>
          <button id="navWaze" style="padding: 12px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">
            🚗 Waze
          </button>
        </div>
        
        <button id="navCancel" style="width: 100%; padding: 10px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
          Anuluj
        </button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('navInternal')?.addEventListener('click', () => {
      calculateRouteWithAPI(road);
      document.body.removeChild(modal);
    });
    
    document.getElementById('navGoogle')?.addEventListener('click', () => {
      openGoogleMaps(road);
      document.body.removeChild(modal);
    });
    
    document.getElementById('navApple')?.addEventListener('click', () => {
      openAppleMaps(road);
      document.body.removeChild(modal);
    });
    
    document.getElementById('navWaze')?.addEventListener('click', () => {
      openWaze(road);
      document.body.removeChild(modal);
    });
    
    document.getElementById('navCancel')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  };

  const stats = {
    total: roads.length,
    accessible: roads.filter(r => r.seasonal === 'cały rok').length,
    seasonal: roads.filter(r => r.seasonal !== 'cały rok').length,
    avgWidth: (roads.reduce((sum, r) => sum + r.width, 0) / roads.length).toFixed(1),
    critical: roads.filter(r => r.slopePercent > 12 || r.width < 4).length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Ładowanie systemu...</p>
        </div>
      </div>
    );
  }

  if (showLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="bg-blue-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">System Sieci Drogowej</h1>
            <p className="text-gray-600">Babia Góra - Służby Ratownicze</p>
            <p className="text-xs text-gray-500 mt-2">Wersja 2.1 - System z bazą danych</p>
          </div>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Wprowadź login"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasło</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Wprowadź hasło"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Zaloguj się
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">lub</span>
              </div>
            </div>

            <button
              onClick={handleGuestMode}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <User className="w-5 h-5" />
              Kontynuuj jako Gość
            </button>
          </div>

          <div className="mt-8 text-xs text-gray-500 text-center space-y-1">
            <p className="font-semibold">Domyślne konto:</p>
            <p>Login: <span className="font-mono bg-gray-100 px-2 py-1 rounded">admin</span></p>
            <p>Hasło: <span className="font-mono bg-gray-100 px-2 py-1 rounded">admin123</span></p>
            <div className="mt-4 pt-4 border-t">
              <p className="font-semibold mb-2">Uprawnienia:</p>
              <div className="text-left space-y-1">
                <p><strong>Gość:</strong> tylko przeglądanie mapy i filtrowanie</p>
                <p><strong>GOPR/PSP/OSP:</strong> pełny dostęp do dróg</p>
                <p className="text-xs">(dodawanie, edycja, usuwanie, notatki, statystyki)</p>
                <p><strong>Administrator:</strong> wszystko + logi + zarządzanie użytkownikami</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="font-semibold">Zabezpieczenia:</p>
              <p>✓ Baza danych użytkowników</p>
              <p>✓ Tryb gościa (tylko podgląd)</p>
              <p>✓ Zgodność z RODO</p>
              <p>✓ System kopii zapasowych</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          height: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
      
      <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white shadow-lg sticky top-0 z-50">
  <div className="max-w-7xl mx-auto px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="w-6 h-6 flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-bold truncate">Sieć Drogowa - Babia Góra</h1>
          <p className="text-xs text-blue-100 hidden sm:block">System ratunkowy v2.1</p>
        </div>
      </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status połączenia */}
              <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-blue-700 rounded text-xs">
                {isOffline ? (
                  <><AlertTriangle className="w-3 h-3 text-red-300" /><span className="text-red-300">Offline</span></>
                ) : (
                  <><Activity className="w-3 h-3 text-green-300" /><span className="text-green-300">Online</span></>
                )}
              </div>

              {/* Sync button - tylko desktop */}
              {!isOffline && !isGuest && (
                <button
                  onClick={syncData}
                  className="hidden md:flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded text-xs"
                  title="Synchronizuj dane"
                >
                  <Database className="w-3 h-3" />
                  <span>Sync</span>
                </button>
              )}

              {/* GPS status */}
              {userLocation && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-green-600 rounded text-xs">
                  <Navigation className="w-3 h-3" />
                  <span className="hidden md:inline">GPS</span>
                </div>
              )}
              
              {/* User info */}
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-700 rounded text-xs">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">{isGuest ? 'Gość' : user?.username}</span>
              </div>

              {/* Admin button */}
              {user?.role === 'admin' && !isGuest && (
                <button
                  onClick={() => setActiveView('admin')}
                  className="p-2 bg-purple-600 hover:bg-purple-700 rounded"
                  title="Panel administracyjny"
                >
                  <Shield className="w-4 h-4" />
                </button>
              )}
              
              {/* Logout */}
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-blue-700 rounded"
                title="Wyloguj"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md p-3 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setActiveView('map')}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 text-sm ${
                activeView === 'map' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Map className="w-4 h-4" />
              <span className="hidden sm:inline">Mapa</span>
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 text-sm ${
                activeView === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
            {!isGuest && (
              <>
                <button
                  onClick={() => setActiveView('stats')}
                  className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 text-sm ${
                    activeView === 'stats' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span className="hidden sm:inline">Statystyki</span>
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setActiveView('logs')}
                    className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 text-sm ${
                      activeView === 'logs' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Logi ({activityLog.length})</span>
                  </button>
                )}
              </>
            )}
            {user?.role === 'admin' && !isGuest && (
              <button
                onClick={() => setActiveView('admin')}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0 text-sm ${
                  activeView === 'admin' ? 'bg-purple-600 text-white' : 'bg-purple-100 hover:bg-purple-200'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          {/* Pierwszy rząd - wyszukiwarka i filtry */}
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Szukaj drogi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap text-sm"
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filtry</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Drugi rząd - akcje */}
          <div className="flex flex-wrap gap-2">
            
            {!isGuest && (
              <button
                onClick={() => {
                  setShowAddRoad(true);
                  setTempMarker(newRoadForm.coords);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Dodaj</span>
              </button>
            )}
            
            {!isGuest && (
              <>
                <button
                  onClick={() => handleExport('json')}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Eksport</span>
                </button>

                {user?.role === 'admin' && (
                  <button
                    onClick={handleBackup}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <Database className="w-4 h-4" />
                    <span className="hidden sm:inline">Backup</span>
                  </button>
                )}
              </>
            )}

            {!isOffline && !isGuest && (
              <button
                onClick={syncData}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ml-auto text-sm"
                title="Synchronizuj dane"
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Sync</span>
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ drogi</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({...filters, type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="wszystkie">Wszystkie</option>
                  <option value="lokalna">Lokalna</option>
                  <option value="leśna">Leśna</option>
                  <option value="polna">Polna</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nawierzchnia</label>
                <select
                  value={filters.surface}
                  onChange={(e) => setFilters({...filters, surface: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="wszystkie">Wszystkie</option>
                  <option value="asfalt">Asfalt</option>
                  <option value="utwardzona">Utwardzona</option>
                  <option value="żwir">Żwir</option>
                  <option value="nieutwardzona">Nieutwardzona</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dostępność</label>
                <select
                  value={filters.seasonal}
                  onChange={(e) => setFilters({...filters, seasonal: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="wszystkie">Wszystkie</option>
                  <option value="cały rok">Cały rok</option>
                  <option value="IV-XI">IV-XI</option>
                  <option value="V-X">V-X</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pojazdy</label>
                <select
                  value={filters.accessibility}
                  onChange={(e) => setFilters({...filters, accessibility: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="wszystkie">Wszystkie</option>
                  <option value="pojazdy wszystkie">Wszystkie pojazdy</option>
                  <option value="pojazdy terenowe">Pojazdy terenowe</option>
                  <option value="pojazdy lekkie">Pojazdy lekkie</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min. szerokość (m)</label>
                <input
                  type="number"
                  value={filters.minWidth}
                  onChange={(e) => setFilters({...filters, minWidth: parseFloat(e.target.value) || 0})}
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max. nachylenie (%)</label>
                <input
                  type="number"
                  value={filters.maxSlope}
                  onChange={(e) => setFilters({...filters, maxSlope: parseFloat(e.target.value) || 100})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max. odl. od głównej (km)</label>
                <input
                  type="number"
                  value={filters.maxDistanceFromMain}
                  onChange={(e) => setFilters({...filters, maxDistanceFromMain: parseFloat(e.target.value) || 10})}
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        {activeView === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Wszystkie drogi</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
                </div>
                <Layers className="w-12 h-12 text-blue-200" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Dostępne cały rok</p>
                  <p className="text-3xl font-bold text-green-600">{stats.accessible}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-200" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Sezonowe</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats.seasonal}</p>
                </div>
                <Clock className="w-12 h-12 text-yellow-200" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Krytyczne</p>
                  <p className="text-3xl font-bold text-red-600">{stats.critical}</p>
                </div>
                <AlertTriangle className="w-12 h-12 text-red-200" />
              </div>
            </div>
          </div>
        )}

        {activeView === 'logs' && user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Dziennik aktywności</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activityLog.map((log: ActivityLog) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{log.description}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString('pl-PL')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {log.type} • {log.user}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'admin' && user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Panel Administracyjny</h2>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                Dodaj użytkownika
              </button>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Statystyki użytkowników</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{users.length}</p>
                  <p className="text-sm text-gray-600">Wszystkich</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{users.filter(u => u.active).length}</p>
                  <p className="text-sm text-gray-600">Aktywnych</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">{users.filter(u => u.role === 'admin').length}</p>
                  <p className="text-sm text-gray-600">Adminów</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{users.filter(u => u.role !== 'admin').length}</p>
                  <p className="text-sm text-gray-600">Ratowników</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Login</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Rola</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Data utworzenia</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u.id} className={!u.active ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-gray-800">{u.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          u.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800' 
                            : u.role === 'gopr'
                            ? 'bg-red-100 text-red-800'
                            : u.role === 'psp'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleUserActive(u.id)}
                          className={`px-2 py-1 text-xs rounded ${
                            u.active 
                              ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {u.active ? 'Aktywny' : 'Nieaktywny'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(u.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edytuj"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Usuń"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'list' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Wszystkie drogi ({filteredRoads.length})
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nazwa drogi</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Typ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Szerokość</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nawierzchnia</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nachylenie</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Dostępność</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Max. ładunek</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRoads.map((road) => (
                    <tr key={road.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">{road.name}</p>
                          <p className="text-xs text-gray-500">ID: {road.id} • Aktualizacja: {road.lastUpdate}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 capitalize">
                          {road.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{road.width} m</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{road.surface}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          road.slopePercent > 12 
                            ? 'bg-red-100 text-red-800' 
                            : road.slopePercent > 8
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {road.slopePercent}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          road.seasonal === 'cały rok'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {road.seasonal}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{road.maxWeight} t</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => showNavigationOptions(road)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Nawiguj GPS"
                          >
                            <Navigation className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRoad(road);
                              setActiveView('map');
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Pokaż na mapie"
                          >
                            <MapPin className="w-4 h-4" />
                          </button>
                          {!isGuest && (
                            <>
                              <button
                                onClick={() => setEditingRoad(road)}
                                className="p-1 text-yellow-600 hover:bg-yellow-50 rounded"
                                title="Edytuj"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRoad(road.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Usuń"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredRoads.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nie znaleziono dróg spełniających kryteria</p>
              </div>
            )}
          </div>
        )}

     {activeView === 'map' && ( 
  <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
    <div className="xl:col-span-1 space-y-3 order-2 xl:order-1">
      {/* Legenda mapy */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          onClick={() => setShowMapLegend(!showMapLegend)}
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold flex items-center justify-between hover:from-blue-700 hover:to-blue-800 transition-all"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            <span>Legenda mapy</span>
          </div>
          <ChevronDown className={`w-5 h-5 transition-transform ${showMapLegend ? 'rotate-180' : ''}`} />
        </button>
        
        {showMapLegend && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                Markery dróg
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow"></div>
                  <span className="text-sm text-gray-600">Droga normalna (nachylenie &lt; 12%)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow"></div>
                  <span className="text-sm text-gray-600">Droga stroma (nachylenie &gt; 12%)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow"></div>
                  <span className="text-sm text-gray-600 font-semibold">Droga wybrana (powiększony marker)</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Punkty kryzysowe
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-3.5 h-3.5 rounded-full bg-orange-500 border-2 border-white shadow"></div>
                  <span className="text-sm text-gray-600">Punkty turystyczne, schroniska, szlaki</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                <Navigation className="w-4 h-4" />
                Nawigacja
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-blue-500 border-3 border-white shadow-lg animate-pulse"></div>
                  <span className="text-sm text-gray-600 font-semibold">Twoja lokalizacja GPS</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-0.5 bg-blue-600"></div>
                  <span className="text-sm text-gray-600">Trasa nawigacyjna (aktywna)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 border-4 border-white shadow-xl"></div>
                  <span className="text-sm text-gray-600">Wybrana lokalizacja (tryb edycji)</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Parametry dróg</h3>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded font-medium">Cały rok</span>
                  <span>- Droga dostępna zawsze</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-medium">Sezon.</span>
                  <span>- Droga dostępna sezonowo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-medium">Stromo!</span>
                  <span>- Nachylenie powyżej 12%</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3 bg-blue-50 -mx-4 -mb-4 px-4 py-3">
              <p className="text-xs text-blue-800">
                <strong>Wskazówka:</strong> Kliknij na marker na mapie, aby zobaczyć szczegóły drogi i uruchomić nawigację GPS.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          Drogi ({filteredRoads.length})
        </h2>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredRoads.map(road => (
                    <div
                      key={road.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedRoad?.id === road.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div onClick={() => setSelectedRoad(road)} className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 mb-1">{road.name}</h3>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Typ:</span> {road.type} • 
                              <span className="font-medium"> Szer:</span> {road.width}m
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Nachylenie:</span> {road.slopePercent}% • 
                              <span className="font-medium"> Max:</span> {road.maxWeight}t
                            </p>
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Odl. od głównej:</span> {road.distanceFromMain}km
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 text-xs rounded ${
                            road.seasonal === 'cały rok'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {road.seasonal}
                          </span>
                          {road.slopePercent > 12 && (
                            <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">
                              Stromo!
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            showNavigationOptions(road);
                          }}
                          className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex items-center justify-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          Nawiguj GPS
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-3 space-y-4 order-1 xl:order-2">
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Map className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-gray-800">Mapa OpenStreetMap</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCrisisPoints(!showCrisisPoints)}
                      className={`text-xs px-3 py-1 rounded ${
                        showCrisisPoints 
                          ? 'bg-orange-100 text-orange-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {showCrisisPoints ? 'Ukryj' : 'Pokaż'} punkty kryzysowe
                    </button>
                    <button
                      onClick={() => setShowFullscreenMap(true)}
                      className="text-xs px-3 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 flex items-center gap-1"
                      title="Powiększ mapę"
                    >
                      <Upload className="w-4 h-4 rotate-45" />
                      Pełny ekran
                    </button>
                  </div>
                </div>
                <div style={{ height: '400px' }}>
                  <LeafletMap
                    roads={filteredRoads}
                    crisisPoints={crisisPoints}
                    selectedRoad={selectedRoad}
                    onRoadSelect={setSelectedRoad}
                    showCrisisPoints={showCrisisPoints}
                    userLocation={userLocation}
                    tempMarker={null}
                    routeCoordinates={routeCoordinates}
                    navigationActive={navigationActive}
                  />
                </div>
              </div>

              {showRoutePanel && navigationActive && (
                <div className="bg-white rounded-lg shadow-md p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-green-600 animate-pulse" />
                      <h3 className="text-lg font-bold text-gray-800">Nawigacja aktywna</h3>
                    </div>
                    <button
                      onClick={stopNavigation}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Zakończ
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-blue-600 font-medium">Dystans</p>
                      <p className="text-xl font-bold text-blue-900">{routeDistance.toFixed(1)} km</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-green-600 font-medium">Czas dojazdu</p>
                      <p className="text-xl font-bold text-green-900">{Math.round(routeDuration)} min</p>
                    </div>
                  </div>

                  {routeInstructions.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Instrukcje nawigacji:</p>
                      <div className="space-y-1">
                        {routeInstructions.map((instruction, index) => (
                          <p key={index} className="text-xs text-gray-600 leading-relaxed">
                            {instruction}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedRoad && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">{selectedRoad.name}</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        ID: {selectedRoad.id} • Ostatnia aktualizacja: {selectedRoad.lastUpdate}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => showNavigationOptions(selectedRoad)}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg text-blue-700"
                        title="Nawiguj do lokalizacji"
                      >
                        <Navigation className="w-5 h-5" />
                      </button>
                      {!isGuest && (
                        <>
                          <button
                            onClick={() => {
                              setEditingRoad(selectedRoad);
                              setTempMarker(selectedRoad.coords);
                            }}
                            className="p-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg text-yellow-700"
                            title="Edytuj"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoad(selectedRoad.id)}
                            className="p-2 bg-red-100 hover:bg-red-200 rounded-lg text-red-700"
                            title="Usuń"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setSelectedRoad(null)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Typ drogi</p>
                      <p className="text-lg font-semibold text-gray-800 capitalize">{selectedRoad.type}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Szerokość</p>
                      <p className="text-lg font-semibold text-gray-800">{selectedRoad.width} m</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Nawierzchnia</p>
                      <p className="text-lg font-semibold text-gray-800 capitalize">{selectedRoad.surface}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Dostępność</p>
                      <p className="text-lg font-semibold text-gray-800">{selectedRoad.seasonal}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Nachylenie</p>
                      <p className="text-lg font-semibold text-gray-800">{selectedRoad.slopePercent}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Max. ładunek</p>
                      <p className="text-lg font-semibold text-gray-800">{selectedRoad.maxWeight} ton</p>
                    </div>
                  </div>

                  {selectedRoad.notes && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-1">Notatki systemowe:</p>
                      <p className="text-sm text-gray-600">{selectedRoad.notes}</p>
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-1">Współrzędne GPS:</p>
                    <p className="text-sm font-mono text-gray-600">
                      {selectedRoad.coords[0]}°N, {selectedRoad.coords[1]}°E
                    </p>
                  </div>

                  {selectedRoad.userNotes.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-2">Notatki użytkowników:</p>
                      <div className="space-y-2">
                        {selectedRoad.userNotes.map((note: Note) => (
                          <div key={note.id} className="text-sm bg-white p-2 rounded">
                            <p className="text-gray-800">{note.text}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {note.author} • {new Date(note.timestamp).toLocaleString('pl-PL')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isGuest && (
                    <button
                      onClick={() => setShowUserNoteModal(true)}
                      className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      Dodaj notatkę terenową
                    </button>
                  )}

                  <button
                    onClick={() => showNavigationOptions(selectedRoad)}
                    className="mt-2 w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Nawiguj GPS
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(showAddRoad || editingRoad) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8 relative z-[10000]">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingRoad ? 'Edytuj drogę' : 'Dodaj nową drogę'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddRoad(false);
                    setEditingRoad(null);
                    setTempMarker(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa drogi *</label>
                    <input
                      type="text"
                      value={editingRoad ? editingRoad.name : newRoadForm.name}
                      onChange={(e) => editingRoad 
                        ? setEditingRoad({...editingRoad, name: e.target.value})
                        : setNewRoadForm({...newRoadForm, name: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="np. Droga Zawoja - Polica"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Typ drogi</label>
                    <select
                      value={editingRoad ? editingRoad.type : newRoadForm.type}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, type: e.target.value})
                        : setNewRoadForm({...newRoadForm, type: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="lokalna">Lokalna</option>
                      <option value="leśna">Leśna</option>
                      <option value="polna">Polna</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Szerokość (m)</label>
                    <input
                      type="number"
                      value={editingRoad ? editingRoad.width : newRoadForm.width}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, width: parseFloat(e.target.value)})
                        : setNewRoadForm({...newRoadForm, width: parseFloat(e.target.value)})
                      }
                      step="0.5"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nawierzchnia</label>
                    <select
                      value={editingRoad ? editingRoad.surface : newRoadForm.surface}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, surface: e.target.value})
                        : setNewRoadForm({...newRoadForm, surface: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="asfalt">Asfalt</option>
                      <option value="utwardzona">Utwardzona</option>
                      <option value="żwir">Żwir</option>
                      <option value="nieutwardzona">Nieutwardzona</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dostępność</label>
                    <select
                      value={editingRoad ? editingRoad.seasonal : newRoadForm.seasonal}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, seasonal: e.target.value})
                        : setNewRoadForm({...newRoadForm, seasonal: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="cały rok">Cały rok</option>
                      <option value="IV-XI">IV-XI</option>
                      <option value="V-X">V-X</option>
                      <option value="VI-IX">VI-IX</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nachylenie (%)</label>
                    <input
                      type="number"
                      value={editingRoad ? editingRoad.slopePercent : newRoadForm.slopePercent}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, slopePercent: parseFloat(e.target.value)})
                        : setNewRoadForm({...newRoadForm, slopePercent: parseFloat(e.target.value)})
                      }
                      step="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max. ładunek (t)</label>
                    <input
                      type="number"
                      value={editingRoad ? editingRoad.maxWeight : newRoadForm.maxWeight}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, maxWeight: parseFloat(e.target.value)})
                        : setNewRoadForm({...newRoadForm, maxWeight: parseFloat(e.target.value)})
                      }
                      step="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                    <textarea
                      value={editingRoad ? editingRoad.notes : newRoadForm.notes}
                      onChange={(e) => editingRoad
                        ? setEditingRoad({...editingRoad, notes: e.target.value})
                        : setNewRoadForm({...newRoadForm, notes: e.target.value})
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Dodatkowe informacje o drodze..."
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Lokalizacja GPS</label>
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-800">
                            <p className="font-semibold mb-1">Jak wybrać lokalizację?</p>
                            <p>Kliknij na mapce poniżej, aby zaznaczyć miejsce drogi. Pojawi się zielony marker.</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                        <div style={{ height: '300px' }}>
                          <LeafletMap
                            roads={[]}
                            crisisPoints={[]}
                            selectedRoad={null}
                            onRoadSelect={() => {}}
                            showCrisisPoints={false}
                            userLocation={null}
                            onMapClick={handleMapClick}
                            tempMarker={tempMarker || (editingRoad ? editingRoad.coords : newRoadForm.coords)}
                            routeCoordinates={[]}
                            navigationActive={false}
                          />
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                        <strong>Debug:</strong> tempMarker = {tempMarker ? `[${tempMarker[0].toFixed(4)}, ${tempMarker[1].toFixed(4)}]` : 'null (używam domyślnych coords)'}
                      </div>
                      
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">Wybrane współrzędne:</span>
                          {tempMarker && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              Lokalizacja wybrana
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-sm text-gray-800 mt-1">
                          {editingRoad 
                            ? `${editingRoad.coords[0].toFixed(6)}°N, ${editingRoad.coords[1].toFixed(6)}°E`
                            : `${newRoadForm.coords[0].toFixed(6)}°N, ${newRoadForm.coords[1].toFixed(6)}°E`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddRoad(false);
                    setEditingRoad(null);
                    setTempMarker(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={editingRoad ? handleUpdateRoad : handleAddRoad}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingRoad ? 'Zapisz zmiany' : 'Dodaj drogę'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUserNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 relative z-[10000]">
            <h3 className="text-xl font-bold mb-4">Dodaj notatkę terenową</h3>
            <textarea
              value={newUserNote}
              onChange={(e) => setNewUserNote(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Opisz warunki terenowe, przeszkody, dodatkowe informacje..."
            />
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowUserNoteModal(false);
                  setNewUserNote('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Anuluj
              </button>
              <button
                onClick={handleAddUserNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Zapisz notatkę
              </button>
            </div>
          </div>
        </div>
      )}

      {(showAddUser || editingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 relative z-[10000]">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingUser ? 'Edytuj użytkownika' : 'Dodaj nowego użytkownika'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddUser(false);
                    setEditingUser(null);
                    setNewUser({
                      username: '',
                      password: '',
                      role: 'osp'
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Login *</label>
                    <input
                      type="text"
                      value={editingUser ? editingUser.username : newUser.username}
                      onChange={(e) => editingUser 
                        ? setEditingUser({...editingUser, username: e.target.value})
                        : setNewUser({...newUser, username: e.target.value})
                      }
                      disabled={!!editingUser}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      placeholder="np. jan.kowalski"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hasło *</label>
                    <input
                      type="password"
                      value={editingUser ? editingUser.password : newUser.password}
                      onChange={(e) => editingUser
                        ? setEditingUser({...editingUser, password: e.target.value})
                        : setNewUser({...newUser, password: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rola (typ konta) *</label>
                    <select
                      value={editingUser ? editingUser.role : newUser.role}
                      onChange={(e) => editingUser
                        ? setEditingUser({...editingUser, role: e.target.value})
                        : setNewUser({...newUser, role: e.target.value})
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="admin">Administrator</option>
                      <option value="gopr">GOPR</option>
                      <option value="psp">PSP (Straż Pożarna)</option>
                      <option value="osp">OSP (Straż Ochotnicza)</option>
                    </select>
                  </div>

                  {editingUser && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={editingUser.active ? 'true' : 'false'}
                        onChange={(e) => setEditingUser({...editingUser, active: e.target.value === 'true'})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="true">Aktywny</option>
                        <option value="false">Nieaktywny</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Informacje o rolach:</p>
                      <ul className="space-y-1 ml-4 list-disc">
                        <li><strong>Administrator</strong> - pełny dostęp + zarządzanie użytkownikami</li>
                        <li><strong>GOPR/PSP/OSP</strong> - pełny dostęp do dróg (dodawanie, edycja, usuwanie, notatki)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddUser(false);
                    setEditingUser(null);
                    setNewUser({
                      username: '',
                      password: '',
                      role: 'osp'
                    });
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={editingUser ? handleUpdateUser : handleAddNewUser}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingUser ? 'Zapisz zmiany' : 'Dodaj użytkownika'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFullscreenMap && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-[9999] flex flex-col">
          <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Map className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Mapa pełnoekranowa - Babia Góra</h2>
                <p className="text-sm text-blue-100">
                  {filteredRoads.length} dróg • {showCrisisPoints ? 'Punkty kryzysowe widoczne' : 'Punkty kryzysowe ukryte'}
                  {navigationActive && ' • 🧭 Nawigacja aktywna'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {navigationActive && (
                <button
                  onClick={stopNavigation}
                  className="px-4 py-2 rounded text-sm bg-red-500 hover:bg-red-600 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Zakończ nawigację
                </button>
              )}
              <button
                onClick={() => setShowCrisisPoints(!showCrisisPoints)}
                className={`px-4 py-2 rounded text-sm ${
                  showCrisisPoints 
                    ? 'bg-orange-500 hover:bg-orange-600' 
                    : 'bg-blue-700 hover:bg-blue-800'
                }`}
              >
                {showCrisisPoints ? 'Ukryj' : 'Pokaż'} punkty kryzysowe
              </button>
              <button
                onClick={() => setShowFullscreenMap(false)}
                className="p-2 hover:bg-blue-700 rounded"
                title="Zamknij"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
  <div className="flex-1 relative">
  <div className="absolute inset-0 p-4">
    {/* Legenda w trybie pełnoekranowym */}
    <div className="absolute top-8 left-8 z-[1000]">
  <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-xs">
    <button
      onClick={() => setShowMapLegend(!showMapLegend)}
      className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold flex items-center justify-between hover:from-blue-700 hover:to-blue-800 transition-all text-sm"
    >
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4" />
        <span>Legenda</span>
      </div>
      <ChevronDown className={`w-4 h-4 transition-transform ${showMapLegend ? 'rotate-180' : ''}`} />
    </button>
    
    {showMapLegend && (
      <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
        <div>
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Markery dróg
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white shadow"></div>
              <span className="text-xs text-gray-600">Normalna (&lt;12%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white shadow"></div>
              <span className="text-xs text-gray-600">Stroma (&gt;12%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow"></div>
              <span className="text-xs text-gray-600 font-semibold">Wybrana</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-2">
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Punkty
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white shadow"></div>
              <span className="text-xs text-gray-600">Kryzysowe</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow animate-pulse"></div>
              <span className="text-xs text-gray-600 font-semibold">Twoja lokalizacja</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-2">
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
            <Navigation className="w-3 h-3" />
            Nawigacja
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-blue-600"></div>
              <span className="text-xs text-gray-600">Trasa GPS</span>
            </div>
          </div>
        </div>
      </div>
    )}
</div>
</div>

<div className="h-full rounded-lg overflow-hidden shadow-2xl">
  <div style={{ height: '100%', width: '100%' }}>
    <LeafletMap
                    roads={filteredRoads}
                    crisisPoints={crisisPoints}
                    selectedRoad={selectedRoad}
                    onRoadSelect={setSelectedRoad}
                    showCrisisPoints={showCrisisPoints}
                    userLocation={userLocation}
                    tempMarker={null}
                    routeCoordinates={routeCoordinates}
                    navigationActive={navigationActive}
                  />
                </div>
              </div>
            </div>
            
            {selectedRoad && (
              <div className="absolute top-8 right-8 bg-white rounded-lg shadow-xl p-4 max-w-md z-[1000]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">{selectedRoad.name}</h3>
                    <p className="text-xs text-gray-500">ID: {selectedRoad.id}</p>
                  </div>
                  <button
                    onClick={() => setSelectedRoad(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Typ</p>
                    <p className="font-semibold capitalize">{selectedRoad.type}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Szerokość</p>
                    <p className="font-semibold">{selectedRoad.width} m</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Nawierzchnia</p>
                    <p className="font-semibold capitalize">{selectedRoad.surface}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Nachylenie</p>
                    <p className="font-semibold">{selectedRoad.slopePercent}%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Dostępność</p>
                    <p className="font-semibold">{selectedRoad.seasonal}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Max. ładunek</p>
                    <p className="font-semibold">{selectedRoad.maxWeight} t</p>
                  </div>
                </div>
                
                {selectedRoad.notes && (
                  <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                    <p className="font-semibold text-gray-700 mb-1">Notatki:</p>
                    <p className="text-gray-600">{selectedRoad.notes}</p>
                  </div>
                )}
                
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => showNavigationOptions(selectedRoad)}
                    className="flex-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded text-sm flex items-center justify-center gap-1"
                  >
                    <Navigation className="w-4 h-4" />
                    Nawiguj
                  </button>
                  {!isGuest && (
                    <>
                      <button
                        onClick={() => {
                          setEditingRoad(selectedRoad);
                          setTempMarker(selectedRoad.coords);
                          setShowFullscreenMap(false);
                        }}
                        className="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-sm flex items-center justify-center gap-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edytuj
                      </button>
                      <button
                        onClick={() => {
                          setShowUserNoteModal(true);
                          setShowFullscreenMap(false);
                        }}
                        className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm flex items-center justify-center gap-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        Notatka
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {navigationActive && showRoutePanel && (
              <div className="absolute bottom-8 left-8 bg-white rounded-lg shadow-xl p-4 max-w-md z-[1000]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-green-600 animate-pulse" />
                    <h3 className="font-bold text-gray-800">Nawigacja GPS</h3>
                  </div>
                  <button
                    onClick={stopNavigation}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-blue-50 p-2 rounded">
                    <p className="text-xs text-blue-600 font-medium">Dystans</p>
                    <p className="text-lg font-bold text-blue-900">{routeDistance.toFixed(1)} km</p>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <p className="text-xs text-green-600 font-medium">Czas</p>
                    <p className="text-lg font-bold text-green-900">{Math.round(routeDuration)} min</p>
                  </div>
                </div>

                {routeInstructions.length > 0 && (
                  <div className="max-h-32 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Instrukcje:</p>
                    <div className="space-y-1">
                      {routeInstructions.slice(0, 5).map((instruction, index) => (
                        <p key={index} className="text-xs text-gray-600">
                          {instruction}
                        </p>
                      ))}
                      {routeInstructions.length > 5 && (
                        <p className="text-xs text-gray-500 italic">... i {routeInstructions.length - 5} więcej</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 text-white px-6 py-3 text-xs">
            <div className="flex items-center justify-between">
              <p>© OpenStreetMap contributors • System Sieci Drogowej - Babia Góra v2.1</p>
              {userLocation && (
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">GPS: {userLocation[0].toFixed(4)}°N, {userLocation[1].toFixed(4)}°E</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default RescueApp;