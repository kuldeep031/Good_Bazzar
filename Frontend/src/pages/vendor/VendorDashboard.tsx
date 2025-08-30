import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, ShoppingCart, Package, Clock, MapPin, Filter, Search, TrendingUp, User, Edit, Camera, Mail, Phone, Building, Shield, Star, Calendar, Navigation, Target, Truck, CreditCard, CheckCircle2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { usePayment } from "@/hooks/use-payment";
import { PaymentSuccess } from "@/components/PaymentSuccess";
import { useAuth } from "@/contexts/AuthContext";
import { vendorApi } from "@/services/vendorApi";
import { orderApi } from "@/services/orderApi";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { 
  generateOrderId, 
  formatAmount,
  calculateDeliveryCharge,
  calculateTax,
  calculateGroupDiscount,
  PAYMENT_METHODS
} from "@/lib/razorpay";
import { fetchProductGroups } from "@/lib/productGroupApi";

const VendorDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("group");
  const [groupSearch, setGroupSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [joinQuantity, setJoinQuantity] = useState(0);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showGroupSuggestionsModal, setShowGroupSuggestionsModal] = useState(false);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  
  // Payment-related states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Payment success states
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  
  // Location-based filtering states
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [locationFilter, setLocationFilter] = useState("all"); // "all", "nearby", "custom"
  const [supplierLocationFilter, setSupplierLocationFilter] = useState("all"); // separate filter for suppliers
  const [customLocationRadius, setCustomLocationRadius] = useState(10); // in km
  const [supplierRadius, setSupplierRadius] = useState(25); // separate radius for suppliers
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  
  const { toast } = useToast();
  const { processRazorpayPayment, processCODPayment, isProcessing, isLoading, error } = usePayment();
  
  // User details for payment prefill - will be loaded from database
  const [userDetails, setUserDetails] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [vendorProfile, setVendorProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  
  // Profile edit form state
  const [editFormData, setEditFormData] = useState({
    fullName: "",
    stallName: "",
    mobileNumber: "",
    stallType: "",
    stallAddress: "",
    city: "",
    state: "",
    pincode: "",
    languagePreference: "",
    preferredDeliveryTime: "",
    rawMaterialNeeds: ""
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Order-related states
  const [vendorOrders, setVendorOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Auto-detect location on component mount
  useEffect(() => {
    checkLocationPermission();
  }, []);

  // Fetch vendor profile data
  useEffect(() => {
    const fetchVendorProfile = async () => {
      if (!user?.uid) {
        setProfileLoading(false);
        return;
      }

      try {
        const response = await vendorApi.getByUserId(user.uid);
        const profile = response.vendor;
        setVendorProfile(profile);
        
        // Initialize edit form data
        setEditFormData({
          fullName: profile.fullName || "",
          stallName: profile.stallName || "",
          mobileNumber: profile.mobileNumber || "",
          stallType: profile.stallType || "",
          stallAddress: profile.stallAddress || "",
          city: profile.city || "",
          state: profile.state || "",
          pincode: profile.pincode || "",
          languagePreference: profile.languagePreference || "",
          preferredDeliveryTime: profile.preferredDeliveryTime || "",
          rawMaterialNeeds: Array.isArray(profile.rawMaterialNeeds) ? profile.rawMaterialNeeds.join(", ") : ""
        });
        
        // Set user details for payment
        setUserDetails({
          name: profile.fullName,
          email: user.email || "",
          phone: profile.mobileNumber
        });
      } catch (error) {
        console.error('Error fetching vendor profile:', error);
        toast({
          title: "Error",
          description: "Failed to load profile data. Please refresh the page.",
          variant: "destructive"
        });
      } finally {
        setProfileLoading(false);
      }
    };

    fetchVendorProfile();
  }, [user, toast]);

  // Function to save order to database
  const saveOrderToDatabase = async (paymentData, paymentResponse) => {
    try {
      console.log('Saving order to database:', paymentData);
      
      if (!vendorProfile?.id) {
        console.error('Vendor profile not loaded');
        toast({
          title: "Warning",
          description: "Order placed but vendor profile missing. Please contact support.",
          variant: "destructive"
        });
        return;
      }

      // Find supplier ID for both individual and group orders
      let supplierId = null;
      if (paymentData.type === 'individual' && paymentData.supplier?.id) {
        supplierId = paymentData.supplier.id;
        console.log('🔧 Individual order - supplier ID:', supplierId);
      } else if (paymentData.type === 'group' && paymentData.group?.created_by) {
        supplierId = paymentData.group.created_by;
        console.log('🔧 Group order - supplier ID from created_by:', supplierId);
        console.log('🔧 Group data:', paymentData.group);
      } else if (paymentData.type === 'group') {
        console.error('🚨 Group order missing created_by field!');
        console.error('🚨 Full group data:', paymentData.group);
        console.error('🚨 Available group fields:', Object.keys(paymentData.group || {}));
      }

      if (!supplierId) {
        console.error('🚨 CRITICAL: No supplier ID found!');
        console.error('🚨 Payment type:', paymentData.type);
        console.error('🚨 Payment data:', paymentData);
        
        toast({
          title: "Order Creation Failed",
          description: "Supplier information is missing. Please try again or contact support.",
          variant: "destructive"
        });
        return;
      }

      console.log('🔧 Final supplier ID to be saved:', supplierId);
      console.log('🔧 Order type to be saved:', paymentData.type);

      // Prepare order items
      const orderItems = [{
        name: paymentData.type === 'individual' ? paymentData.product : paymentData.group?.product,
        quantity: paymentData.quantity,
        pricePerKg: paymentData.pricePerKg,
        subtotal: paymentData.subtotal
      }];

      // Prepare customer details
      const customerDetails = {
        name: userDetails.name,
        email: userDetails.email,
        phone: userDetails.phone,
        address: currentLocation?.name || 'Location not provided'
      };

      const orderData = {
        id: paymentData.orderId,
        vendor_id: vendorProfile.id,
        supplier_id: supplierId,
        order_type: paymentData.type,
        items: orderItems,
        subtotal: paymentData.subtotal,
        tax: paymentData.tax,
        delivery_charge: paymentData.deliveryCharge || 0,
        group_discount: paymentData.groupDiscount || 0,
        total_amount: paymentData.total,
        status: 'confirmed',
        payment_status: 'completed',
        payment_method: paymentResponse?.razorpay_payment_id ? 'online' : 'cod',
        payment_id: paymentResponse?.razorpay_payment_id || paymentResponse?.paymentId,
        delivery_address: currentLocation?.name,
        delivery_date: null,
        notes: null,
        customer_details: customerDetails
      };

      console.log('Order data to save:', orderData);
      
      const response = await orderApi.create(orderData);
      console.log('Order saved successfully:', response);
      
      // 🔧 Additional verification logging
      console.log('✅ Order created with details:');
      console.log('📋 Order ID:', orderData.id);
      console.log('👨‍💼 Vendor ID:', orderData.vendor_id);
      console.log('🏢 Supplier ID:', orderData.supplier_id);
      console.log('📦 Order Type:', orderData.order_type);
      console.log('💰 Total Amount:', orderData.total_amount);
      
      toast({
        title: "Order Confirmed! 🎉",
        description: `Order ${paymentData.orderId} has been saved successfully.`,
      });

      // Refresh orders list
      fetchVendorOrders();

    } catch (error) {
      console.error('Error saving order to database:', error);
      toast({
        title: "Order Partially Complete",
        description: "Payment successful but order save failed. Please contact support with your payment ID.",
        variant: "destructive"
      });
    }
  };

  // Function to fetch vendor orders
  const fetchVendorOrders = async () => {
    try {
      if (!vendorProfile?.id) {
        setOrdersLoading(false);
        return;
      }

      console.log('Fetching orders for vendor:', vendorProfile.id);
      const response = await orderApi.getByVendorId(vendorProfile.id);
      console.log('Vendor orders response:', response);
      
      // Parse JSON fields
      const ordersWithParsedData = response.orders.map(order => ({
        ...order,
        items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
        customer_details: order.customer_details ? 
          (typeof order.customer_details === 'string' ? JSON.parse(order.customer_details) : order.customer_details) 
          : null
      }));

      setVendorOrders(ordersWithParsedData);
    } catch (error) {
      console.error('Error fetching vendor orders:', error);
      toast({
        title: "Error",
        description: "Failed to load your orders. Please refresh the page.",
        variant: "destructive"
      });
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch vendor orders when vendor profile is loaded
  useEffect(() => {
    if (vendorProfile?.id) {
      fetchVendorOrders();
    }
  }, [vendorProfile]);

  const checkLocationPermission = async () => {
    if (!navigator.geolocation) {
      setLocationPermission('unavailable');
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      setLocationPermission(permission.state);
      
      if (permission.state === 'granted') {
        detectCurrentLocation();
      }
    } catch (error) {
      console.log('Permission API not supported, trying geolocation directly');
      detectCurrentLocation();
    }
  };

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support location services.",
        variant: "destructive"
      });
      return;
    }

    setIsDetectingLocation(true);
    
    toast({
      title: "Detecting location...",
      description: "Please allow location access when prompted.",
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Set basic coordinates first
        setCurrentLocation({ latitude, longitude, name: "Detecting address..." });
        
        // Get precise location name using reverse geocoding
        try {
          const locationData = await reverseGeocode(latitude, longitude);
          setCurrentLocation({ 
            latitude, 
            longitude, 
            name: locationData.locationName,
            addressComponents: locationData.addressComponents,
            accuracy: position.coords.accuracy 
          });
          
          // Log pin code detection for debugging
          if (locationData.addressComponents?.postcode) {
            console.log('📮 Detected pin code from location:', locationData.addressComponents.postcode);
          } else {
            console.log('⚠️ No pin code detected from current location');
          }
          
          toast({
            title: "Location detected successfully",
            description: `📍 ${locationData.locationName}`,
          });
        } catch (error) {
          // Keep coordinates with fallback name
          const coords = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
          setCurrentLocation({ 
            latitude, 
            longitude, 
            name: coords,
            addressComponents: null,
            accuracy: position.coords.accuracy 
          });
          
          toast({
            title: "Location detected",
            description: "Using coordinate-based location",
            variant: "default"
          });
        }
        
        setIsDetectingLocation(false);
      },
      (error) => {
        setIsDetectingLocation(false);
        let errorMessage = "Unable to detect location.";
        let errorTitle = "Location Error";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorTitle = "Location Access Denied";
            errorMessage = "Please enable location permissions in your browser settings and try again.";
            setLocationPermission('denied');
            break;
          case error.POSITION_UNAVAILABLE:
            errorTitle = "Location Unavailable";
            errorMessage = "Your location information is currently unavailable. Please try again later.";
            break;
          case error.TIMEOUT:
            errorTitle = "Location Timeout";
            errorMessage = "Location request timed out. Please check your GPS signal and try again.";
            break;
          default:
            errorMessage = "An unknown error occurred while detecting location.";
        }
        
        toast({
          title: errorTitle,
          description: errorMessage,
          variant: "destructive"
        });
      },
      {
        enableHighAccuracy: true,    // Use GPS if available
        timeout: 15000,              // Wait up to 15 seconds
        maximumAge: 300000           // Cache location for 5 minutes
      }
    );
  };

  // Real reverse geocoding function using OpenStreetMap Nominatim API
  const reverseGeocode = async (lat, lng) => {
    try {
      // Using OpenStreetMap Nominatim API (free alternative to Google Maps)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'MarketConnect-App/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding service unavailable');
      }
      
      const data = await response.json();
      
      if (data && data.display_name) {
        // Extract meaningful location components
        const address = data.address || {};
        
        // Build location string with available components
        let locationParts = [];
        
        if (address.suburb || address.neighbourhood) {
          locationParts.push(address.suburb || address.neighbourhood);
        }
        
        if (address.city || address.town || address.village) {
          locationParts.push(address.city || address.town || address.village);
        }
        
        if (address.state) {
          locationParts.push(address.state);
        }
        
        if (address.country) {
          locationParts.push(address.country);
        }
        
        // Add postcode if available
        if (address.postcode) {
          locationParts.push(address.postcode);
        }
        
        // If we have components, join them, otherwise use display_name
        const locationName = locationParts.length > 0 
          ? locationParts.join(', ')
          : data.display_name.split(',').slice(0, 3).join(',').trim();
        
        // Return both location name and extracted address components
        return {
          locationName,
          addressComponents: {
            area: address.suburb || address.neighbourhood || '',
            city: address.city || address.town || address.village || '',
            state: address.state || '',
            postcode: address.postcode || '',
            country: address.country || ''
          }
        };
      }
      
      // Fallback to coordinates if no address found
      return {
        locationName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        addressComponents: null
      };
      
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      
      // Fallback to a secondary service or coordinates
      try {
        // Try with a simpler request
        const fallbackResponse = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
        );
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          
          if (fallbackData.locality && fallbackData.principalSubdivision) {
            return {
              locationName: `${fallbackData.locality}, ${fallbackData.principalSubdivision}, ${fallbackData.countryName}`,
              addressComponents: {
                area: fallbackData.locality || '',
                city: fallbackData.city || fallbackData.locality || '',
                state: fallbackData.principalSubdivision || '',
                postcode: fallbackData.postcode || '',
                country: fallbackData.countryName || ''
              }
            };
          }
          
          if (fallbackData.city && fallbackData.principalSubdivision) {
            return {
              locationName: `${fallbackData.city}, ${fallbackData.principalSubdivision}, ${fallbackData.countryName}`,
              addressComponents: {
                area: fallbackData.city || '',
                city: fallbackData.city || '',
                state: fallbackData.principalSubdivision || '',
                postcode: fallbackData.postcode || '',
                country: fallbackData.countryName || ''
              }
            };
          }
        }
      } catch (fallbackError) {
        console.warn('Fallback geocoding also failed:', fallbackError);
      }
      
      // Final fallback to coordinates
      return {
        locationName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        addressComponents: null
      };
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
  };

  // Calculate approximate distance between pin codes (in km)
  // This is a simplified calculation based on pin code proximity
  const calculatePinCodeDistance = (pincode1, pincode2) => {
    if (!pincode1 || !pincode2) return Infinity;
    
    // Convert pin codes to numbers for comparison
    const pin1 = parseInt(pincode1.toString().replace(/\D/g, ''));
    const pin2 = parseInt(pincode2.toString().replace(/\D/g, ''));
    
    if (isNaN(pin1) || isNaN(pin2)) return Infinity;
    
    // Same pin code = 0 km distance
    if (pin1 === pin2) return 0;
    
    // Pin codes in India are 6 digits, first digit represents region
    // First 2 digits represent state/area, first 3 digits represent district
    const pin1Str = pin1.toString().padStart(6, '0');
    const pin2Str = pin2.toString().padStart(6, '0');
    
    // Test log for debugging
    console.log(`🧮 Calculating distance between ${pin1Str} and ${pin2Str}`);
    
    // Same first 5 digits (very close areas) = ~0.5-3 km
    if (pin1Str.substring(0, 5) === pin2Str.substring(0, 5)) {
      const diff = Math.abs(parseInt(pin1Str.substring(5)) - parseInt(pin2Str.substring(5)));
      const distance = Math.min(0.5 + (diff * 0.5), 3); // 0.5-3 km very close
      console.log(`🧮 Very close areas (5 digits): diff=${diff}, distance=${distance}km`);
      return distance;
    }
    
    // Same first 4 digits (same sub-district) = ~2-8 km  
    if (pin1Str.substring(0, 4) === pin2Str.substring(0, 4)) {
      const diff = Math.abs(parseInt(pin1Str.substring(4)) - parseInt(pin2Str.substring(4)));
      const distance = Math.min(2 + (diff * 1), 10); // 2-10 km within sub-district
      console.log(`🧮 Same sub-district (4 digits): diff=${diff}, distance=${distance}km`);
      return distance;
    }
    
    // Same first 3 digits (same district) = ~5-25 km
    if (pin1Str.substring(0, 3) === pin2Str.substring(0, 3)) {
      const diff = Math.abs(parseInt(pin1Str.substring(3)) - parseInt(pin2Str.substring(3)));
      const distance = Math.min(5 + (diff * 2), 25); // 5-25 km within district
      console.log(`🧮 Same district (3 digits): diff=${diff}, distance=${distance}km`);
      return distance;
    }
    
    // Same first 2 digits with small difference (nearby areas) = ~10-50 km
    if (pin1Str.substring(0, 2) === pin2Str.substring(0, 2)) {
      const diff = Math.abs(parseInt(pin1Str.substring(2, 4)) - parseInt(pin2Str.substring(2, 4)));
      if (diff <= 20) {
        // Close 3rd-4th digits = nearby areas within same state
        const distance = Math.min(5 + (diff * 2), 50); // 5-50 km for nearby areas
        console.log(`🧮 Nearby areas in same state (2 digits, diff≤20): diff=${diff}, distance=${distance}km`);
        return distance;
      } else if (diff <= 50) {
        // Medium distance areas in same state  
        const distance = Math.min(50 + (diff * 1.5), 120); // 50-120 km for medium areas
        console.log(`🧮 Medium areas in same state (2 digits, diff≤50): diff=${diff}, distance=${distance}km`);
        return distance;
      } else {
        // Farther areas in same state
        const distance = Math.min(120 + (diff * 1), 250); // 120-250 km within state
        console.log(`🧮 Same state (2 digits, diff>50): diff=${diff}, distance=${distance}km`);
        return distance;
      }
    }
    
    // Same first digit (same region) = ~100-500 km
    if (pin1Str.substring(0, 1) === pin2Str.substring(0, 1)) {
      const diff = Math.abs(parseInt(pin1Str.substring(1)) - parseInt(pin2Str.substring(1)));
      const distance = Math.min(100 + (diff * 0.1), 500); // 100-500 km within region
      console.log(`🧮 Same region (1 digit): diff=${diff}, distance=${distance}km`);
      return distance;
    }
    
    // Different regions = 500+ km
    const diff = Math.abs(pin1 - pin2);
    const distance = Math.min(500 + (diff * 0.001), 2000); // 500-2000 km across regions
    console.log(`🧮 Different regions: diff=${diff}, distance=${distance}km`);
    return distance;
  };

  const handleJoinGroup = (group) => {
    setSelectedGroup(group);
    setJoinQuantity(0);
    setShowJoinModal(true);
  };

  const handleJoinGroupWithSuggestions = (group) => {
    setSelectedGroup(group);
    setShowGroupSuggestionsModal(true);
  };

  const handleOrderNow = (supplier) => {
    setSelectedSupplier(supplier);
    setOrderQuantity(1);
    setShowSupplierModal(true);
  };

  const handlePlaceOrder = (supplier, product) => {
    // Calculate total cost including delivery
    const productPrice = parseFloat(supplier.originalPrice || supplier.price.replace('₹', '').replace('/kg', ''));
    const distance = currentLocation ? calculateDistance(
      currentLocation.latitude, 
      currentLocation.longitude,
      supplier.latitude,
      supplier.longitude
    ) : 0;
    
    const deliveryCharge = isSupplierInDeliveryRange(supplier) 
      ? calculateDeliveryCharge(distance, supplier.deliveryCharge) 
      : 0;
    
    const subtotal = productPrice * orderQuantity;
    const tax = calculateTax(subtotal); // 5% GST
    const total = subtotal + deliveryCharge + tax;

    const paymentData = {
      type: 'individual',
      supplier: supplier,
      product: product,
      quantity: orderQuantity,
      pricePerKg: productPrice,
      subtotal: subtotal,
      deliveryCharge: deliveryCharge,
      tax: tax,
      total: total,
      orderId: generateOrderId('individual'),
      timestamp: new Date().toISOString()
    };

    setPaymentDetails(paymentData);
    setShowSupplierModal(false);
    setShowPaymentModal(true);
  };

  const handleJoinGroupPayment = (group, quantity) => {
    console.log('🚀 Starting group order payment process');
    console.log('📋 Group data received:', group);
    console.log('📊 Quantity:', quantity);
    
    const pricePerKg = parseInt(group.pricePerKg.replace('₹', ''));
    const subtotal = quantity * pricePerKg;
    const groupDiscount = calculateGroupDiscount(subtotal, group.discount);
    const discountedAmount = subtotal - groupDiscount;
    const tax = calculateTax(discountedAmount); //  GST
    const total = discountedAmount + tax;

    const paymentData = {
      type: 'group',
      group: group,
      quantity: quantity,
      pricePerKg: pricePerKg,
      subtotal: subtotal,
      groupDiscount: groupDiscount,
      discountedAmount: discountedAmount,
      tax: tax,
      total: total,
      orderId: generateOrderId('group'),
      timestamp: new Date().toISOString()
    };

    console.log('💳 Payment data prepared:', paymentData);
    console.log('🏢 Group supplier info:', {
      supplier: group.supplier,
      created_by: group.created_by,
      groupId: group.id
    });

    setPaymentDetails(paymentData);
    setShowGroupSuggestionsModal(false);
    setShowJoinModal(false);
    setShowPaymentModal(true);
  };

  const processPayment = async (paymentType: 'online' | 'cod') => {
    if (!paymentDetails) return;
    
    console.log('🔧 ProcessPayment Debug:');
    console.log('📦 Payment Details:', paymentDetails);
    console.log('💳 Payment Type:', paymentType);
    console.log('👤 User Details:', userDetails);
    console.log('⏳ isProcessing:', isProcessing);
    console.log('⏳ isLoading:', isLoading);
    console.log('❌ error:', error);
    
    setIsProcessingPayment(true);
    
    try {
      // Handle Cash on Delivery
      if (paymentType === "cod") {
        const codPaymentData = {
          type: paymentDetails.type as 'individual' | 'group',
          orderId: paymentDetails.orderId,
          total: paymentDetails.total,
          description: paymentDetails.type === 'individual' 
            ? `Order for ${paymentDetails.product}`
            : `Group order for ${paymentDetails.group.product}`,
          supplier: paymentDetails.supplier,
          product: paymentDetails.type === 'individual' ? paymentDetails.product : paymentDetails.group.product,
          group: paymentDetails.group,
          quantity: paymentDetails.quantity
        };

        await processCODPayment(codPaymentData, async () => {
          // Prepare success data for COD
          const successData = {
            paymentId: `COD_${Date.now()}`,
            orderId: paymentDetails.orderId,
            amount: paymentDetails.total,
            orderType: paymentDetails.type,
            productName: paymentDetails.type === 'individual' ? paymentDetails.product : paymentDetails.group.product,
            supplierName: paymentDetails.type === 'individual' ? paymentDetails.supplier.name : paymentDetails.group.supplier,
            quantity: paymentDetails.quantity,
            pricePerKg: paymentDetails.pricePerKg,
            subtotal: paymentDetails.subtotal,
            tax: paymentDetails.tax,
            deliveryCharge: paymentDetails.deliveryCharge || 0,
            groupDiscount: paymentDetails.groupDiscount || 0,
            customerDetails: {
              name: userDetails.name,
              email: userDetails.email,
              phone: userDetails.phone,
              address: currentLocation?.name || 'Not provided'
            }
          };

          // Save order to database
          await saveOrderToDatabase(paymentDetails, successData);

          setPaymentSuccessData(successData);
          setShowPaymentModal(false);
          setShowPaymentSuccess(true);
          setPaymentDetails(null);
        });
        return;
      }

      // Handle Online Payments with Razorpay
      const razorpayPaymentData = {
        type: paymentDetails.type as 'individual' | 'group',
        orderId: paymentDetails.orderId,
        total: paymentDetails.total,
        description: paymentDetails.type === 'individual' 
          ? `Order for ${paymentDetails.product}`
          : `Group order for ${paymentDetails.group.product}`,
        supplier: paymentDetails.supplier,
        product: paymentDetails.type === 'individual' ? paymentDetails.product : paymentDetails.group.product,
        group: paymentDetails.group,
        quantity: paymentDetails.quantity
      };

      await processRazorpayPayment(
        razorpayPaymentData,
        userDetails,
        async (response) => {
          console.log('Payment successful:', response);
          
          // Prepare success data with all receipt information
          const successData = {
            paymentId: response.razorpay_payment_id,
            orderId: paymentDetails.orderId,
            amount: paymentDetails.total,
            orderType: paymentDetails.type,
            productName: paymentDetails.type === 'individual' ? paymentDetails.product : paymentDetails.group.product,
            supplierName: paymentDetails.type === 'individual' ? paymentDetails.supplier.name : paymentDetails.group.supplier,
            quantity: paymentDetails.quantity,
            pricePerKg: paymentDetails.pricePerKg,
            subtotal: paymentDetails.subtotal,
            tax: paymentDetails.tax,
            deliveryCharge: paymentDetails.deliveryCharge || 0,
            groupDiscount: paymentDetails.groupDiscount || 0,
            customerDetails: {
              name: userDetails.name,
              email: userDetails.email,
              phone: userDetails.phone,
              address: currentLocation?.name || 'Not provided'
            }
          };

          // Save order to database
          await saveOrderToDatabase(paymentDetails, response);

          setPaymentSuccessData(successData);
          setShowPaymentModal(false);
          setShowPaymentSuccess(true);
          setPaymentDetails(null);
        },
        (error) => {
          console.error('Payment failed:', error);
        }
      );
      
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Payment Failed",
        description: "Please try again or use a different payment method.",
        variant: "destructive"
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleJoinGroupOrder = (group, quantity) => {
    handleJoinGroupPayment(group, quantity);
  };

  const confirmJoinGroup = () => {
    if (joinQuantity <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity (minimum 1 kg)",
        variant: "destructive"
      });
      return;
    }

    const maxAvailable = parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0]);
    
    if (joinQuantity > maxAvailable) {
      toast({
        title: "Quantity Exceeds Limit",
        description: `Maximum available quantity is ${maxAvailable} kg. Please reduce your order.`,
        variant: "destructive"
      });
      return;
    }

    if (maxAvailable <= 0) {
      toast({
        title: "Group Order Full",
        description: "This group order is now full. Please try another group.",
        variant: "destructive"
      });
      return;
    }

    handleJoinGroupPayment(selectedGroup, joinQuantity);
  };

  // Filter group orders based on location and other criteria
  const getFilteredGroupOrders = () => {
    console.log('🔍 Filtering group orders...');
    console.log('📍 Detected pin code:', currentLocation?.addressComponents?.postcode);
    console.log('👤 Vendor profile pin code:', vendorProfile?.pincode);
    console.log('🏠 Location filter:', locationFilter);
    console.log('📏 Radius:', customLocationRadius);
    
    let filtered = groupOrders.filter(order => {
      // Check if group is expired using real-time check
      const isExpired = isGroupExpired(order.deadline);
      const matchesSearch = order.product.toLowerCase().includes(groupSearch.toLowerCase());
      
      if (isExpired || !matchesSearch) {
        if (isExpired) {
          console.log(`⏰ Filtering out expired group: ${order.product} (ID: ${order.id})`);
        }
        return false;
      }

      // Apply location filter
      if (locationFilter === "nearby") {
        console.log(`📦 Checking order ${order.id} with delivery pin: ${order.deliveryPincode}`);
        
        // Priority 1: Use detected pin code first (current location)
        if (currentLocation?.addressComponents?.postcode && order.deliveryPincode) {
          const pinDistance = calculatePinCodeDistance(currentLocation.addressComponents.postcode, order.deliveryPincode);
          console.log(`📍 Pin distance between detected ${currentLocation.addressComponents.postcode} and ${order.deliveryPincode}: ${pinDistance}km`);
          return pinDistance <= customLocationRadius;
        }
        // Priority 2: Use vendor profile pin code as fallback
        else if (vendorProfile?.pincode && order.deliveryPincode) {
          const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, order.deliveryPincode);
          console.log(`📍 Pin distance between profile ${vendorProfile.pincode} and ${order.deliveryPincode}: ${pinDistance}km`);
          return pinDistance <= customLocationRadius;
        }
        // Priority 3: Fallback to GPS coordinates if available
        else if (currentLocation && order.latitude && order.longitude) {
          const distance = calculateDistance(
            currentLocation.latitude, 
            currentLocation.longitude,
            order.latitude,
            order.longitude
          );
          console.log(`📍 GPS distance: ${distance}km`);
          return distance <= customLocationRadius;
        }
        // Priority 4: If no location data available, don't filter
        else {
          console.log(`⚠️ No location data available for order ${order.id}, including in results`);
          return true;
        }
      }

      return true;
    });

    // Sort by distance if location is available
    if (locationFilter === "nearby") {
      filtered.sort((a, b) => {
        // Priority 1: Sort by detected pin code distance if available
        if (currentLocation?.addressComponents?.postcode && a.deliveryPincode && b.deliveryPincode) {
          const distanceA = calculatePinCodeDistance(currentLocation.addressComponents.postcode, a.deliveryPincode);
          const distanceB = calculatePinCodeDistance(currentLocation.addressComponents.postcode, b.deliveryPincode);
          return distanceA - distanceB;
        }
        // Priority 2: Sort by vendor profile pin code distance if available
        else if (vendorProfile?.pincode && a.deliveryPincode && b.deliveryPincode) {
          const distanceA = calculatePinCodeDistance(vendorProfile.pincode, a.deliveryPincode);
          const distanceB = calculatePinCodeDistance(vendorProfile.pincode, b.deliveryPincode);
          return distanceA - distanceB;
        }
        // Priority 3: Fallback to GPS coordinate distance
        else if (currentLocation && a.latitude && a.longitude && b.latitude && b.longitude) {
          const distanceA = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            a.latitude, a.longitude
          );
          const distanceB = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            b.latitude, b.longitude
          );
          return distanceA - distanceB;
        }
        // Priority 4: No sorting if no location data
        return 0;
      });
    }

    console.log(`✅ Filtered results: ${filtered.length} orders out of ${groupOrders.length} total`);
    return filtered;
  };

  // Get distance text for display
  const getDistanceText = (order) => {
    // Priority 1: Use pin code based distance if available
    if (vendorProfile?.pincode && order.deliveryPincode) {
      const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, order.deliveryPincode);
      if (pinDistance < 1) {
        return "Same area";
      } else if (pinDistance < 25) {
        return `~${Math.round(pinDistance)}km away (by pin)`;
      } else {
        return `~${Math.round(pinDistance)}km away (by pin)`;
      }
    }
    
    // Priority 2: Fallback to GPS coordinates if available
    if (currentLocation && order.latitude && order.longitude) {
      const distance = calculateDistance(
        currentLocation.latitude, 
        currentLocation.longitude,
        order.latitude,
        order.longitude
      );
      
      if (distance < 1) {
        return `${(distance * 1000).toFixed(0)}m away`;
      } else {
        return `${distance.toFixed(1)}km away`;
      }
    }
    
    // Priority 3: Show pin code info if available
    if (order.deliveryPincode) {
      return `Pin: ${order.deliveryPincode}`;
    }
    
    return "";
  };

  // Get distance text for suppliers
  const getSupplierDistanceText = (supplier) => {
    // Priority 1: Use pin code based distance if available
    if (vendorProfile?.pincode && supplier.deliveryPincode) {
      const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, supplier.deliveryPincode);
      if (pinDistance < 1) {
        return "Same area";
      } else {
        return `~${Math.round(pinDistance)}km away (by pin)`;
      }
    }
    
    // Priority 2: Fallback to GPS coordinates
    if (currentLocation) {
      const distance = calculateDistance(
        currentLocation.latitude, 
        currentLocation.longitude,
        supplier.latitude,
        supplier.longitude
      );
      
      if (distance < 1) {
        return `${(distance * 1000).toFixed(0)}m away`;
      } else {
        return `${distance.toFixed(1)}km away`;
      }
    }
    
    // Priority 3: Show pin code info if available
    if (supplier.deliveryPincode) {
      return `Pin: ${supplier.deliveryPincode}`;
    }
    
    return "";
  };

  // Check if supplier delivers to user's location
  const isSupplierInDeliveryRange = (supplier) => {
    // Priority 1: Use pin code based delivery range if available
    if (vendorProfile?.pincode && supplier.deliveryPincode) {
      const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, supplier.deliveryPincode);
      return pinDistance <= supplier.deliveryRadius;
    }
    
    // Priority 2: Fallback to GPS coordinates
    if (currentLocation) {
      const distance = calculateDistance(
        currentLocation.latitude, 
        currentLocation.longitude,
        supplier.latitude,
        supplier.longitude
      );
      return distance <= supplier.deliveryRadius;
    }
    
    // Priority 3: Show all if no location data
    return true;
  };

  // Filter suppliers based on location and search
  const getFilteredSuppliers = () => {
    let filtered = individualSuppliers.filter(supplier => {
      const matchesSearch = supplier.product.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                           supplier.name.toLowerCase().includes(supplierSearch.toLowerCase());
      
      if (!matchesSearch) return false;

      // Apply location filter
      if (supplierLocationFilter === "nearby") {
        // Priority 1: Use pin code based filtering if available
        if (vendorProfile?.pincode && supplier.deliveryPincode) {
          const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, supplier.deliveryPincode);
          return pinDistance <= supplierRadius;
        }
        // Priority 2: Fallback to GPS coordinates
        else if (currentLocation) {
          const distance = calculateDistance(
            currentLocation.latitude, 
            currentLocation.longitude,
            supplier.latitude,
            supplier.longitude
          );
          return distance <= supplierRadius;
        }
        // Priority 3: Show all if no location data
        return true;
      }

      if (supplierLocationFilter === "delivery") {
        // Priority 1: Use pin code based delivery range if available
        if (vendorProfile?.pincode && supplier.deliveryPincode) {
          const pinDistance = calculatePinCodeDistance(vendorProfile.pincode, supplier.deliveryPincode);
          return pinDistance <= supplier.deliveryRadius;
        }
        // Priority 2: Fallback to GPS-based delivery range
        else if (currentLocation) {
          return isSupplierInDeliveryRange(supplier);
        }
        // Priority 3: Show all if no location data
        return true;
      }

      return true;
    });

    // Sort by distance if location is available
    if (currentLocation && (supplierLocationFilter === "nearby" || supplierLocationFilter === "delivery")) {
      filtered.sort((a, b) => {
        // Priority 1: Sort by pin code distance if available
        if (vendorProfile?.pincode && a.deliveryPincode && b.deliveryPincode) {
          const distanceA = calculatePinCodeDistance(vendorProfile.pincode, a.deliveryPincode);
          const distanceB = calculatePinCodeDistance(vendorProfile.pincode, b.deliveryPincode);
          return distanceA - distanceB;
        }
        // Priority 2: Fallback to GPS distance
        else {
          const distanceA = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            a.latitude, a.longitude
          );
          const distanceB = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            b.latitude, b.longitude
          );
          return distanceA - distanceB;
        }
      });
    }

    return filtered;
  };

  // Handle form input changes
  const handleFormChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!vendorProfile?.id) {
      toast({
        title: "Error",
        description: "Unable to save profile. Please refresh and try again.",
        variant: "destructive"
      });
      return;
    }

    setIsSavingProfile(true);

    try {
      // Prepare the update data
      const updateData = {
        fullName: editFormData.fullName,
        stallName: editFormData.stallName,
        mobileNumber: editFormData.mobileNumber,
        stallType: editFormData.stallType,
        stallAddress: editFormData.stallAddress,
        city: editFormData.city,
        state: editFormData.state,
        pincode: editFormData.pincode,
        languagePreference: editFormData.languagePreference,
        preferredDeliveryTime: editFormData.preferredDeliveryTime,
        rawMaterialNeeds: editFormData.rawMaterialNeeds.split(',').map(item => item.trim()).filter(item => item)
      };

      // Call the update API
      await vendorApi.update(vendorProfile.id, updateData);

      // Update the local vendor profile state
      const updatedProfile = { ...vendorProfile, ...updateData };
      setVendorProfile(updatedProfile);

      // Update user details for payment
      setUserDetails({
        name: updateData.fullName,
        email: user?.email || "",
        phone: updateData.mobileNumber
      });

      // Close the modal
      setShowProfileEditModal(false);

      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });

    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const supplierOffers = [
    {
      id: 1,
      supplier: "City Wholesale",
      supplierId: "3",
      product: "Mixed Vegetables",
      minQty: "100 kg",
      pricePerKg: "₹22",
      deliveryTime: "Next day",
      location: "Sector 18",
      deliveryAddress: "Sector 18, Fresh Market Complex",
      rating: 4.5
    }
  ];

  // Individual suppliers data derived from product groups (for individual purchases)
  const [individualSuppliers, setIndividualSuppliers] = useState([]);
  
  // Real-time countdown state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for deadline countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Remove expired groups from state
  useEffect(() => {
    const removeExpiredGroups = () => {
      const now = new Date();
      setGroupOrders(prevGroups => {
        const activeGroups = prevGroups.filter(group => {
          const deadline = new Date(group.deadline);
          const isActive = deadline > now;
          if (!isActive) {
            console.log(`🗑️ Removing expired group: ${group.product} (ID: ${group.id}, deadline: ${group.deadline})`);
          }
          return isActive;
        });
        
        // Only update if there's a change to avoid unnecessary re-renders
        if (activeGroups.length !== prevGroups.length) {
          console.log(`🧹 Cleaned up ${prevGroups.length - activeGroups.length} expired group(s). Active groups: ${activeGroups.length}`);
          return activeGroups;
        }
        return prevGroups;
      });
      
      // Also remove from individual suppliers
      setIndividualSuppliers(prevSuppliers => {
        const activeSuppliers = prevSuppliers.filter(supplier => {
          if (supplier.groupData) {
            const deadline = new Date(supplier.groupData.deadline);
            return deadline > now;
          }
          return true;
        });
        
        return activeSuppliers.length !== prevSuppliers.length ? activeSuppliers : prevSuppliers;
      });
    };

    // Check for expired groups every minute
    const cleanupTimer = setInterval(removeExpiredGroups, 60000);
    
    // Also check immediately
    removeExpiredGroups();

    return () => clearInterval(cleanupTimer);
  }, [currentTime]);

  // Enhanced deadline formatting function with real-time countdown
  const formatDeadlineRealTime = (deadlineString: string) => {
    const deadline = new Date(deadlineString);
    const now = currentTime;
    const diffTime = deadline.getTime() - now.getTime();
    
    if (diffTime <= 0) {
      return "⏰ EXPIRED";
    }
    
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `⏱️ ${diffDays}d ${diffHours}h left`;
    } else if (diffHours > 0) {
      return `⏱️ ${diffHours}h ${diffMinutes}m left`;
    } else if (diffMinutes > 0) {
      return `⏱️ ${diffMinutes}m left`;
    } else {
      return "⏰ Expires soon";
    }
  };

  // Check if group is expired
  const isGroupExpired = (deadlineString: string) => {
    const deadline = new Date(deadlineString);
    return deadline <= currentTime;
  };

  const mapGroupData = (group) => {
    console.log('🗺️ Mapping group data:', group);
    const mappedData = {
      id: group.id,
      product: group.product,
      pricePerKg: group.price || "N/A",
      actualRate: group.actual_rate || "",
      finalRate: group.final_rate || "",
      discountPercentage: group.discount_percentage || "",
      targetQty: group.quantity || "N/A",
      currentQty: group.currentQty || "0",
      deadline: group.deadline,
      location: group.location,
      deliveryPincode: group.delivery_pincode || "", // Add delivery pin code
      latitude: group.latitude,
      longitude: group.longitude,
      participants: group.participants || 1,
      status: group.status,
      discount: group.discount || "0%",
      supplier: group.supplier || "Supplier",
      created_by: group.created_by, // 🔧 CRITICAL: Adding created_by field
      deliveryAddress: group.location || "",
      image: group.image || "",
      otherGroupProducts: [],
    };
    console.log('✅ Mapped group data:', mappedData);
    return mappedData;
  };

  // Transform product groups into individual suppliers for individual purchases
  const transformGroupsToSuppliers = (groups) => {
    return groups.map(group => ({
      id: group.created_by, // Use the actual supplier ID, not the group ID
      groupId: group.id, // Keep group ID for reference
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80", // Default image
      name: group.supplier || "Supplier",
      product: group.product,
      price: `₹${group.actual_rate || group.final_rate}/kg`, // Use original price for individual purchases
      originalPrice: group.actual_rate || group.final_rate, // Store original price for calculations
      location: group.location,
      deliveryPincode: group.delivery_pincode || "", // Add delivery pin code for suppliers
      latitude: parseFloat(group.latitude) || 19.0760,
      longitude: parseFloat(group.longitude) || 72.8777,
      verified: true,
      memberYears: 3,
      rating: 4.5,
      deliveryRadius: 25, // Default delivery radius
      deliveryCharge: 50, // Default delivery charge
      otherProducts: [], // Will be populated if needed
      groupData: group // Store original group data for reference
    }));
  };

  // Fetch product groups from backend
  useEffect(() => {
    const loadGroups = async () => {
      try {
        console.log('🔄 Loading product groups from backend...');
        const groups = await fetchProductGroups();
        console.log('📥 Raw groups from backend:', groups);
        
        const mappedGroups = groups.map(mapGroupData);
        setGroupOrders(mappedGroups);
        console.log('✅ Mapped product groups:', mappedGroups);
        
        // Check pin code data availability
        const groupsWithPinCodes = mappedGroups.filter(g => g.deliveryPincode);
        console.log('📍 Groups with pin codes:', groupsWithPinCodes.length, '/', mappedGroups.length);
        if (groupsWithPinCodes.length > 0) {
          console.log('📍 First group with pin code:', groupsWithPinCodes[0]);
        }
        
        // Check if vendor has pin code
        if (vendorProfile?.pincode) {
          console.log('👤 Vendor pin code:', vendorProfile.pincode);
        } else {
          console.log('⚠️ Vendor pin code not available yet');
        }
        
        // Check if any groups have created_by field
        const groupsWithCreatedBy = mappedGroups.filter(g => g.created_by);
        console.log('👥 Groups with created_by field:', groupsWithCreatedBy);
        
        // Transform groups into individual suppliers
        const suppliers = transformGroupsToSuppliers(groups);
        setIndividualSuppliers(suppliers);
        console.log('👨‍💼 Individual suppliers:', suppliers);
      } catch (err) {
        console.error('❌ Error loading groups:', err);
        toast({
          title: "Error",
          description: "Failed to fetch product groups.",
          variant: "destructive"
        });
      }
    };
    loadGroups();
  }, [vendorProfile]);

  const [groupOrders, setGroupOrders] = useState<any[]>([]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pt-20">
      {/* Loading State */}
      {profileLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your profile...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Header - Hidden */}
          <div className="hidden">
            <div className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <img 
                    src="/logo.jpg" 
                    alt="MarketConnect Logo" 
                    className="w-16 h-16 object-contain rounded-lg"
                  />
                  <div>
                    <h1 className="text-2xl font-bold text-white">MarketConnect</h1>
                    {vendorProfile && (
                      <p className="text-blue-100 text-sm">Welcome back, {vendorProfile.fullName}!</p>
                    )}
                  </div>
                </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  className="p-2 hover:bg-blue-500 rounded-lg text-white"
                  onClick={() => setShowHamburgerMenu(!showHamburgerMenu)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                
                {/* Hamburger Menu Dropdown */}
                {showHamburgerMenu && (
                  <div className="absolute right-0 top-12 bg-white rounded-lg shadow-lg border min-w-[200px] z-50">
                    <div className="py-2">
                      <button 
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => {
                          setShowProfileEditModal(true);
                          setShowHamburgerMenu(false);
                        }}
                      >
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">My Profile</span>
                      </button>
                      <button 
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => setShowHamburgerMenu(false)}
                      >
                        <Shield className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">Account Settings</span>
                      </button>
                      <button 
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                        onClick={() => setShowHamburgerMenu(false)}
                      >
                        <Phone className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">Help & Support</span>
                      </button>
                      <hr className="my-2" />
                      <button 
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 text-red-600"
                        onClick={async () => {
                          try {
                            setShowHamburgerMenu(false);
                            console.log('Logging out vendor...');
                            await logout();
                            console.log('Logout successful, navigating to home...');
                            navigate('/');
                            // Fallback redirect in case navigate doesn't work
                            setTimeout(() => {
                              if (window.location.pathname !== '/') {
                                window.location.href = '/';
                              }
                            }, 100);
                          } catch (error) {
                            console.error('Logout error:', error);
                            toast({
                              title: "Logout Error",
                              description: "Failed to logout. Please try again.",
                              variant: "destructive"
                            });
                          }
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="w-8 h-8 bg-blue-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Orders Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white p-1 rounded-lg border shadow-sm">
            <TabsTrigger value="individual" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">Browse Suppliers</TabsTrigger>
            <TabsTrigger value="group" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">Group Orders</TabsTrigger>
            <TabsTrigger value="my-orders" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">My Orders</TabsTrigger>
            <TabsTrigger value="price-trends" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Price Trends</TabsTrigger>
            </TabsList>

          <TabsContent value="individual" className="space-y-4">
            <div className="bg-blue-500 text-white rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-2">Find Suppliers</h2>
              <p className="text-blue-100 mb-4">Search and filter suppliers based on your needs</p>
              <div className="bg-blue-400 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong>Note:</strong> Individual purchases show original prices (no group discounts applied)
                </p>
              </div>
            </div>
            
            {/* Location Status Bar for Suppliers */}
            <div className="bg-white rounded-lg border p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-500" />
                  <div>
                    {/* Pin Code Information (Priority) */}
                    {vendorProfile?.pincode && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-600">📮 Your Pin Code:</span>
                        <span className="ml-2 text-sm text-gray-700 font-medium">{vendorProfile.pincode}</span>
                        <span className="ml-2 text-xs text-green-600">(Used for smart filtering)</span>
                      </div>
                    )}
                    
                    {/* Detected Pin Code (if different from profile) */}
                    {currentLocation?.addressComponents?.postcode && 
                     currentLocation.addressComponents.postcode !== vendorProfile?.pincode && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-orange-600">📍 Detected Pin Code:</span>
                        <span className="ml-2 text-sm text-gray-700 font-medium">{currentLocation.addressComponents.postcode}</span>
                        {!vendorProfile?.pincode && (
                          <button
                            onClick={() => {
                              // Auto-update pin code if vendor profile doesn't have one
                              setEditFormData(prev => ({
                                ...prev,
                                pincode: currentLocation.addressComponents.postcode
                              }));
                              toast({
                                title: "Pin Code Detected",
                                description: "Would you like to update your profile with this pin code?",
                                action: (
                                  <button
                                    onClick={handleSaveProfile}
                                    className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                                  >
                                    Update Profile
                                  </button>
                                )
                              });
                            }}
                            className="ml-2 text-xs text-green-600 hover:text-green-800 underline"
                          >
                            Use this pin code
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* GPS Location Information */}
                    {currentLocation ? (
                      <div>
                        <span className="text-sm font-medium text-blue-600">📍 GPS Location:</span>
                        <div className="mt-1">
                          <span className="text-sm text-gray-700 font-medium">{currentLocation.name}</span>
                          {currentLocation.accuracy && (
                            <span className="ml-2 text-xs text-gray-500">
                              (±{Math.round(currentLocation.accuracy)}m)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {isDetectingLocation ? "🔍 Detecting location for delivery..." : "📍 Set location for delivery estimates"}
                      </span>
                    )}
                    
                    {/* Filtering Method Indicator */}
                    {locationFilter === "nearby" && (
                      <div className="mt-2 text-xs text-blue-500">
                        {vendorProfile?.pincode ? 
                          "🎯 Using pin code for smart distance calculation" : 
                          (currentLocation ? "🎯 Using GPS coordinates for distance" : "⚠️ No location data for filtering")
                        }
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {!currentLocation && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={detectCurrentLocation}
                      disabled={isDetectingLocation}
                      className="flex items-center gap-2"
                    >
                      <Navigation className="w-4 h-4" />
                      {isDetectingLocation ? "Detecting..." : "Set My Location"}
                    </Button>
                  )}
                  
                  {currentLocation && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={detectCurrentLocation}
                      disabled={isDetectingLocation}
                      className="flex items-center gap-2"
                    >
                      <Navigation className="w-4 h-4" />
                      {isDetectingLocation ? "Updating..." : "Update Location"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Search and Filter Controls for Suppliers */}
            <div className="flex gap-4 items-center flex-wrap mb-6">
              <div className="relative flex-1 min-w-[300px]">
                <input
                  type="text"
                  placeholder="Search for materials, suppliers..."
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-900 bg-white"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              
              <select 
                value={supplierLocationFilter} 
                onChange={(e) => setSupplierLocationFilter(e.target.value)}
                className="px-3 py-3 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="all">All Suppliers</option>
                <option value="nearby" disabled={!currentLocation}>
                  {currentLocation ? `Within ${supplierRadius}km` : "Nearby (location required)"}
                </option>
                <option value="delivery" disabled={!currentLocation}>
                  {currentLocation ? "Available for Delivery" : "Delivery (location required)"}
                </option>
              </select>
              
              {(supplierLocationFilter === "nearby" || supplierLocationFilter === "delivery") && currentLocation && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {supplierLocationFilter === "nearby" ? "Search Radius:" : "Max Distance:"}
                  </span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={supplierRadius}
                    onChange={(e) => setSupplierRadius(parseInt(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600 min-w-[40px]">{supplierRadius}km</span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {getFilteredSuppliers().map(supplier => {
                const distanceText = getSupplierDistanceText(supplier);
                const inDeliveryRange = isSupplierInDeliveryRange(supplier);
                
                return (
                  <div key={supplier.id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-4">
                    <img src={supplier.image} alt={supplier.name} className="h-40 w-full object-cover rounded-lg mb-3" />
                    <div className="font-semibold text-lg text-gray-900">{supplier.product}</div>
                    <div className="text-gray-600 text-sm">{supplier.name}</div>
                    <div className="flex items-center text-xs text-gray-500 mt-1 mb-2">
                      <span>{supplier.location}</span>
                      {supplier.verified && <span className="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">Verified</span>}
                    </div>
                    
                    {/* Location and Delivery Info */}
                    {currentLocation && (
                      <div className="mb-2">
                        {distanceText && (
                          <div className="flex items-center text-xs text-gray-500 mb-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            <span>{distanceText}</span>
                          </div>
                        )}
                        <div className="flex items-center text-xs mb-1">
                          {inDeliveryRange ? (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              Delivers (₹{supplier.deliveryCharge})
                            </span>
                          ) : (
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
                              Outside delivery area
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-blue-600 font-bold text-lg mb-1">{supplier.price}</div>
                    <div className="flex items-center text-xs text-gray-500 mb-3">
                      <span>Member: {supplier.memberYears} yrs</span>
                      <span className="ml-2">⭐ {supplier.rating}</span>
                    </div>
                    <button 
                      className={`w-full py-2 rounded-lg font-medium transition-colors ${
                        currentLocation && !inDeliveryRange 
                          ? 'bg-gray-400 text-white cursor-not-allowed' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      onClick={() => handleOrderNow(supplier)}
                      disabled={currentLocation && !inDeliveryRange}
                    >
                      {currentLocation && !inDeliveryRange ? 'No Delivery' : 'Order Now'}
                    </button>
                  </div>
                );
              })}
            </div>
            
            {getFilteredSuppliers().length === 0 && (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 mb-2">No Suppliers Found</h3>
                <p className="text-gray-500 mb-4">
                  {supplierLocationFilter === "nearby" && !currentLocation 
                    ? "Enable location detection to find nearby suppliers."
                    : supplierLocationFilter === "delivery" && !currentLocation
                    ? "Set your location to see suppliers that deliver to you."
                    : supplierSearch 
                    ? "Try adjusting your search or location filters."
                    : "No suppliers match your criteria."}
                </p>
                {(supplierLocationFilter === "nearby" || supplierLocationFilter === "delivery") && !currentLocation && (
                  <Button
                    variant="outline"
                    onClick={detectCurrentLocation}
                    disabled={isDetectingLocation}
                    className="flex items-center gap-2 mx-auto"
                  >
                    <Navigation className="w-4 h-4" />
                    {isDetectingLocation ? "Detecting..." : "Set My Location"}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="group" className="space-y-4">
            <div className="bg-green-500 text-white rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-2">Group Orders</h2>
              <p className="text-green-100 mb-4">Join group orders for bulk discounts</p>
              <div className="bg-green-400 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong>Note:</strong> Group orders show discounted prices (final rates with bulk discounts)
                </p>
              </div>
            </div>
            
            {/* Location and Search Controls */}
            <div className="space-y-4 mb-6">
              {/* Location Status Bar */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-gray-500" />
                      <div>
                        {/* Pin Code Information (Priority) */}
                        {vendorProfile?.pincode && (
                          <div className="mb-2">
                            <span className="text-sm font-medium text-green-600">📮 Your Pin Code:</span>
                            <span className="ml-2 text-sm text-gray-700 font-medium">{vendorProfile.pincode}</span>
                            <span className="ml-2 text-xs text-green-600">(Smart distance calculation)</span>
                          </div>
                        )}
                        
                        {/* Detected Pin Code (if different from profile) */}
                        {currentLocation?.addressComponents?.postcode && 
                         currentLocation.addressComponents.postcode !== vendorProfile?.pincode && (
                          <div className="mb-2">
                            <span className="text-sm font-medium text-orange-600">📍 Detected Pin Code:</span>
                            <span className="ml-2 text-sm text-gray-700 font-medium">{currentLocation.addressComponents.postcode}</span>
                            {!vendorProfile?.pincode && (
                              <span className="ml-2 text-xs text-orange-600">(Consider updating your profile)</span>
                            )}
                          </div>
                        )}
                        
                        {/* GPS Location Information */}
                        {currentLocation ? (
                          <div>
                            <span className="text-sm font-medium text-green-600">📍 GPS Location:</span>
                            <div className="mt-1">
                              <span className="text-sm text-gray-700 font-medium">{currentLocation.name}</span>
                              {currentLocation.accuracy && (
                                <span className="ml-2 text-xs text-gray-500">
                                  (±{Math.round(currentLocation.accuracy)}m accuracy)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">
                            {isDetectingLocation ? "🔍 Detecting precise location..." : "📍 Location not detected"}
                          </span>
                        )}
                        
                        {/* Filtering Method Indicator */}
                        {locationFilter === "nearby" && (
                          <div className="mt-2 text-xs text-green-500">
                            {vendorProfile?.pincode ? 
                              "🎯 Using pin code for precise distance filtering" : 
                              (currentLocation ? "🎯 Using GPS coordinates for distance" : "⚠️ No location data for filtering")
                            }
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!currentLocation && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={detectCurrentLocation}
                          disabled={isDetectingLocation}
                          className="flex items-center gap-2"
                        >
                          <Navigation className="w-4 h-4" />
                          {isDetectingLocation ? "Detecting..." : "Detect Location"}
                        </Button>
                      )}
                      
                      {currentLocation && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={detectCurrentLocation}
                          disabled={isDetectingLocation}
                          className="flex items-center gap-2"
                        >
                          <Navigation className="w-4 h-4" />
                          {isDetectingLocation ? "Updating..." : "Update Location"}
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLocationModal(true)}
                        className="flex items-center gap-2"
                      >
                        <Target className="w-4 h-4" />
                        Location Settings
                      </Button>
                    </div>
                  </div>
                </div>

              {/* Search and Filter Controls */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[300px]">
                  <input
                    type="text"
                    placeholder="Search product groups..."
                    value={groupSearch}
                    onChange={e => setGroupSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
                
                <select 
                  value={locationFilter} 
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="all">All Locations</option>
                  <option 
                    value="nearby" 
                    disabled={!currentLocation && !vendorProfile?.pincode}
                  >
                    {(currentLocation || vendorProfile?.pincode) ? 
                      `Within ${customLocationRadius}km` : 
                      "Nearby (location/pin code required)"
                    }
                  </option>
                </select>
                
                {locationFilter === "nearby" && (currentLocation || vendorProfile?.pincode) && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Radius:</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={customLocationRadius}
                      onChange={(e) => setCustomLocationRadius(parseInt(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-600 min-w-[40px]">{customLocationRadius}km</span>
                    <span className="text-xs text-gray-500">
                      ({vendorProfile?.pincode ? 'Pin code based' : 'GPS based'})
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {getFilteredGroupOrders().map((order) => {
                  const progress = Math.min(100, Math.round((parseInt(order.currentQty) / parseInt(order.targetQty)) * 100));
                  const distanceText = getDistanceText(order);
                  
                  return (
                    <div key={order.id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-4">
                      <div className="mb-3">
                        <div className="w-full h-32 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                          <Package className="w-12 h-12 text-green-600" />
                        </div>
                      </div>
                      <div className="font-semibold text-lg text-gray-900">{order.product}</div>
                      <div className="text-gray-600 text-sm">by {order.supplier}</div>
                      <div className="flex items-center text-xs text-gray-500 mt-1 mb-2">
                        <span>{order.participants} members</span>
                        <span className="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
                          {order.discountPercentage || order.discount || '15%'} OFF
                        </span>
                      </div>
                      
                      {/* Location Info */}
                      <div className="flex items-center text-xs text-gray-500 mb-2">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span>{order.location}</span>
                        {distanceText && (
                          <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {distanceText}
                          </span>
                        )}
                      </div>
                      
                      {/* Real-time Deadline Countdown */}
                      <div className="flex items-center text-xs mb-2">
                        <Clock className="w-3 h-3 mr-1" />
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          isGroupExpired(order.deadline) ? 'bg-red-100 text-red-700' :
                          formatDeadlineRealTime(order.deadline).includes('m left') ? 'bg-orange-100 text-orange-700' :
                          formatDeadlineRealTime(order.deadline).includes('h left') ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {formatDeadlineRealTime(order.deadline)}
                        </span>
                      </div>
                      
                      {/* Price Information */}
                      <div className="mb-2">
                        <div className="text-green-600 font-bold text-lg mb-1">
                          ₹{order.finalRate || order.pricePerKg}
                        </div>
                        {order.actualRate && order.finalRate && (
                          <div className="text-xs text-gray-500">
                            <span className="line-through">₹{order.actualRate}/kg</span>
                            <span className="ml-2 text-green-600 font-medium">
                              Final: ₹{order.finalRate}/kg
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center text-xs text-gray-500 mb-3">
                        <span>Target: {order.targetQty}</span>
                        <span className="ml-2">Current: {order.currentQty}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden mb-3">
                        <div className="h-2 bg-green-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>
                      
                      {/* Join Button with Expiry Check */}
                      {isGroupExpired(order.deadline) ? (
                        <button 
                          className="w-full bg-gray-400 text-white py-2 rounded-lg font-medium cursor-not-allowed" 
                          disabled
                        >
                          ⏰ Expired
                        </button>
                      ) : progress >= 100 ? (
                        <button 
                          className="w-full bg-gray-400 text-white py-2 rounded-lg font-medium cursor-not-allowed" 
                          disabled
                        >
                          ✅ Full
                        </button>
                      ) : (
                        <button 
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors" 
                          onClick={() => handleJoinGroup(order)}
                        >
                          Join Group ({Math.max(0, parseInt(order.targetQty) - parseInt(order.currentQty))}kg left)
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {getFilteredGroupOrders().length === 0 && (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Groups Found</h3>
                  <p className="text-gray-500 mb-4">
                    {locationFilter === "nearby" && !currentLocation 
                      ? "Enable location detection to find nearby groups."
                      : groupSearch 
                      ? "Try adjusting your search or location filters."
                      : "No active group orders match your criteria."}
                  </p>
                  {locationFilter === "nearby" && !currentLocation && (
                    <Button
                      variant="outline"
                      onClick={detectCurrentLocation}
                      disabled={isDetectingLocation}
                      className="flex items-center gap-2 mx-auto"
                    >
                      <Navigation className="w-4 h-4" />
                      {isDetectingLocation ? "Detecting..." : "Detect My Location"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my-orders" className="space-y-4">
            <div className="bg-purple-500 text-white rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-2">My Orders</h2>
              <p className="text-purple-100 mb-4">Track your order history</p>
            </div>
            
            <div className="space-y-4">
              {ordersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span className="ml-2 text-gray-600">Loading your orders...</span>
                </div>
              ) : vendorOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Orders Yet</h3>
                  <p className="text-gray-500">Your orders will appear here after you make a purchase.</p>
                </div>
              ) : (
                vendorOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-5 flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="flex-1 mb-4 md:mb-0">
                      <div className="font-semibold text-lg text-gray-900 mb-1">
                        {order.items && order.items.length > 0 ? order.items[0].name : 'Unknown Product'} 
                        ({order.items && order.items.length > 0 ? order.items[0].quantity : 0}kg)
                      </div>
                      <div className="text-gray-600 text-sm mb-1">
                        Order ID: {order.id}
                      </div>
                      <div className="text-gray-600 text-sm mb-1">
                        Payment: {order.payment_method === 'online' ? 'Online' : 'Cash on Delivery'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-col items-end min-w-[140px]">
                      <div className="text-lg font-semibold text-purple-600 mb-2">
                        ₹{order.total_amount.toFixed(2)}
                      </div>
                      <div className={`text-sm mb-2 font-medium ${
                        order.status === 'confirmed' ? 'text-green-600' :
                        order.status === 'pending' ? 'text-yellow-600' :
                        order.status === 'delivered' ? 'text-blue-600' :
                        'text-gray-600'
                      }`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="font-medium border-purple-500 text-purple-600 hover:bg-purple-50"
                        onClick={() => {
                          toast({
                            title: "Order Details",
                            description: `Order ${order.id} - ${order.status}`,
                          });
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="price-trends" className="space-y-4">
            <div className="bg-orange-500 text-white rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-2">Daily Price Trends</h2>
              <p className="text-orange-100 mb-4">Track price movements for your items</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Rice</h3>
                  <p className="text-green-600 text-sm font-medium">↓2% from yesterday</p>
                </div>
                <div className="text-lg font-semibold text-green-600">₹48/kg</div>
                      </div>
              <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Wheat</h3>
                  <p className="text-red-600 text-sm font-medium">↑1.5% from yesterday</p>
                    </div>
                <div className="text-lg font-semibold text-red-600">₹35/kg</div>
                    </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Join Group Modal */}
      {showJoinModal && selectedGroup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md border">
            <h2 className="text-xl font-semibold mb-4">Join Group Order</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedGroup.product}</h3>
                <p className="text-muted-foreground">by {selectedGroup.supplier}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Price:</span>
                  <div className="font-semibold">{selectedGroup.pricePerKg}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Available:</span>
                  <div className="font-semibold">{selectedGroup.targetQty}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Current:</span>
                  <div className="font-semibold">{selectedGroup.currentQty}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Members:</span>
                  <div className="font-semibold">{selectedGroup.participants}</div>
                </div>
              </div>

              {/* Location Information */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Delivery Location</span>
                </div>
                <p className="text-sm text-blue-700">{selectedGroup.deliveryAddress}</p>
                {currentLocation && (
                  <p className="text-xs text-blue-600 mt-1">
                    {getDistanceText(selectedGroup)} from your location
                  </p>
                )}
              </div>

              {/* Available Quantity Information */}
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-sm text-green-800">
                  <strong>Available to Order:</strong> {parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])} kg remaining
                </div>
                <div className="text-xs text-green-600 mt-1">
                  Join now to secure your quantity before the group fills up!
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Your Quantity (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={joinQuantity}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    const maxAvailable = parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0]);
                    if (value <= maxAvailable && value >= 0) {
                      setJoinQuantity(value);
                    }
                  }}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="1"
                  max={parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])}
                  placeholder={`Enter quantity (max: ${parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])} kg)`}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Minimum: 1 kg</span>
                  <span>Maximum: {parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])} kg</span>
                </div>
                {joinQuantity > (parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])) && (
                  <div className="text-red-500 text-xs mt-1">
                    Quantity exceeds available amount. Maximum available: {parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])} kg
                  </div>
                )}
              </div>

              {joinQuantity > 0 && (
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Quantity:</span>
                      <span className="font-semibold">{joinQuantity} kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Price per kg:</span>
                      <span className="font-semibold">{selectedGroup.pricePerKg}</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between text-base">
                      <span className="font-semibold">Total Cost:</span>
                      <span className="font-bold text-green-600">
                        ₹{(joinQuantity * parseInt(selectedGroup.pricePerKg.replace('₹', ''))).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowJoinModal(false)}>
                Cancel
              </Button>
              <Button 
                variant="default" 
                onClick={confirmJoinGroup}
                disabled={
                  joinQuantity <= 0 || 
                  joinQuantity > (parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])) ||
                  (parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])) <= 0
                }
                className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {(parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0])) <= 0 
                  ? "Group Full" 
                  : joinQuantity <= 0 
                  ? "Enter Quantity" 
                  : joinQuantity > (parseInt(selectedGroup.targetQty.split(' ')[0]) - parseInt(selectedGroup.currentQty.split(' ')[0]))
                  ? "Exceeds Limit"
                  : `Join Group (₹${(joinQuantity * parseInt(selectedGroup.pricePerKg.replace('₹', ''))).toLocaleString()})`
                }
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Supplier Order Modal */}
      {showSupplierModal && selectedSupplier && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl border max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Order from {selectedSupplier.name}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <span>{selectedSupplier.location}</span>
                  {selectedSupplier.verified && <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">Verified</span>}
                  <span>⭐ {selectedSupplier.rating}</span>
                </div>
                
                {/* Location and Delivery Info */}
                {currentLocation && (
                  <div className="bg-blue-50 rounded-lg p-3 mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Delivery Information</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700">Distance:</span>
                        <div className="font-medium">{getSupplierDistanceText(selectedSupplier)}</div>
                      </div>
                      <div>
                        <span className="text-blue-700">Delivery:</span>
                        <div className="font-medium">
                          {isSupplierInDeliveryRange(selectedSupplier) ? (
                            <span className="text-green-600">Available (₹{selectedSupplier.deliveryCharge})</span>
                          ) : (
                            <span className="text-red-600">Outside delivery area</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-blue-700">Your Location:</span>
                        <div className="font-medium text-xs">{currentLocation.name}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowSupplierModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Current Product */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Selected Product</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-4 mb-4">
                  <img src={selectedSupplier.image} alt={selectedSupplier.product} className="w-20 h-20 object-cover rounded-lg" />
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{selectedSupplier.product}</div>
                    <div className="text-blue-600 font-bold text-xl">{selectedSupplier.price}</div>
                  </div>
                </div>
                
                {/* Quantity and Total Calculation */}
                <div className="bg-white rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Quantity (kg)</label>
                      <input
                        type="number"
                        value={orderQuantity}
                        onChange={(e) => setOrderQuantity(parseInt(e.target.value) || 1)}
                        className="w-full border rounded px-3 py-2"
                        min="1"
                        max="1000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Subtotal</label>
                      <div className="text-lg font-bold text-blue-600">
                        ₹{(parseFloat(selectedSupplier.originalPrice || selectedSupplier.price.replace('₹', '').replace('/kg', '')) * orderQuantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  {currentLocation && isSupplierInDeliveryRange(selectedSupplier) && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between text-sm">
                        <span>Delivery Charge:</span>
                        <span className="font-medium">₹{selectedSupplier.deliveryCharge}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
                  onClick={() => handlePlaceOrder(selectedSupplier, selectedSupplier.product)}
                >
                  Proceed to Payment - ₹{(() => {
                    const productPrice = parseFloat(selectedSupplier.originalPrice || selectedSupplier.price.replace('₹', '').replace('/kg', ''));
                    const deliveryCharge = currentLocation && isSupplierInDeliveryRange(selectedSupplier) ? selectedSupplier.deliveryCharge : 0;
                    const subtotal = productPrice * orderQuantity;
                    const tax = Math.round(subtotal * 0.05);
                    return (subtotal + deliveryCharge + tax).toFixed(0);
                  })()}
                </button>
              </div>
            </div>

            {/* Other Products from Same Supplier */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">More from {selectedSupplier.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedSupplier.otherProducts.map((product, index) => (
                  <div key={index} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <img src={product.image} alt={product.name} className="w-full h-32 object-cover rounded-lg mb-3" />
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-blue-600 font-bold mb-2">{product.price}</div>
                    <button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
                      onClick={() => handlePlaceOrder(selectedSupplier, product.name)}
                    >
                      Add to Order
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Similar Suppliers */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Similar Suppliers</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {individualSuppliers
                  .filter(supplier => supplier.id !== selectedSupplier.id && 
                    (supplier.product.includes(selectedSupplier.product.split(' ')[0]) || 
                     selectedSupplier.product.includes(supplier.product.split(' ')[0])))
                  .slice(0, 2)
                  .map((supplier) => (
                    <div key={supplier.id} className="bg-gray-50 border rounded-lg p-4 flex items-center gap-4">
                      <img src={supplier.image} alt={supplier.product} className="w-16 h-16 object-cover rounded-lg" />
                      <div className="flex-1">
                        <div className="font-semibold">{supplier.name}</div>
                        <div className="text-sm text-gray-600">{supplier.product}</div>
                        <div className="text-blue-600 font-bold">{supplier.price}</div>
                      </div>
                      <button 
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
                        onClick={() => {
                          setSelectedSupplier(supplier);
                        }}
                      >
                        View
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Group Order Suggestions Modal */}
      {showGroupSuggestionsModal && selectedGroup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl border max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Join Group Order</h2>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>by {selectedGroup.supplier}</span>
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">{selectedGroup.discount} OFF</span>
                  <span>{selectedGroup.participants} members</span>
                </div>
              </div>
              <button 
                onClick={() => setShowGroupSuggestionsModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Selected Group Order */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Selected Group Order</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-4">
                <img src={selectedGroup.image} alt={selectedGroup.product} className="w-20 h-20 object-cover rounded-lg" />
                <div className="flex-1">
                  <div className="font-semibold text-lg">{selectedGroup.product}</div>
                  <div className="text-green-600 font-bold text-xl">{selectedGroup.pricePerKg}</div>
                  <div className="text-sm text-gray-600">Target: {selectedGroup.targetQty} | Current: {selectedGroup.currentQty}</div>
                  <div className="w-full h-2 bg-gray-200 rounded mt-2">
                    <div 
                      className="h-2 bg-green-500 rounded transition-all" 
                      style={{ width: `${Math.min(100, Math.round((parseInt(selectedGroup.currentQty) / parseInt(selectedGroup.targetQty)) * 100))}%` }}
                    />
                  </div>
                </div>
                <button 
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
                  onClick={() => handleJoinGroupOrder(selectedGroup, 10)}
                >
                  Join Group
                </button>
              </div>
            </div>

            {/* Other Group Orders from Same Supplier */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">More Group Orders from {selectedGroup.supplier}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedGroup.otherGroupProducts.map((groupProduct, index) => {
                  const progress = Math.min(100, Math.round((parseInt(groupProduct.currentQty) / parseInt(groupProduct.targetQty)) * 100));
                  return (
                    <div key={index} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <img src={groupProduct.image} alt={groupProduct.product} className="w-full h-32 object-cover rounded-lg mb-3" />
                      <div className="font-semibold">{groupProduct.product}</div>
                      <div className="text-green-600 font-bold mb-1">{groupProduct.pricePerKg}</div>
                      <div className="text-xs text-gray-500 mb-2">
                        <span>{groupProduct.participants} members</span>
                        <span className="ml-2 bg-green-100 text-green-700 px-1 py-0.5 rounded">{groupProduct.discount} OFF</span>
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        Target: {groupProduct.targetQty} | Current: {groupProduct.currentQty}
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded mb-3">
                        <div className="h-2 bg-green-500 rounded transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <button 
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
                        onClick={() => handleJoinGroupOrder({...selectedGroup, product: groupProduct.product, pricePerKg: groupProduct.pricePerKg}, 5)}
                      >
                        Join This Group
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Similar Group Orders */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Similar Group Orders</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groupOrders
                  .filter(order => order.id !== selectedGroup.id && 
                    (order.product.toLowerCase().includes('vegetable') || 
                     selectedGroup.product.toLowerCase().includes('vegetable') ||
                     order.supplier !== selectedGroup.supplier))
                  .slice(0, 2)
                  .map((order) => {
                    const progress = Math.min(100, Math.round((parseInt(order.currentQty) / parseInt(order.targetQty)) * 100));
                    return (
                      <div key={order.id} className="bg-gray-50 border rounded-lg p-4 flex items-center gap-4">
                        <img src={order.image} alt={order.product} className="w-16 h-16 object-cover rounded-lg" />
                        <div className="flex-1">
                          <div className="font-semibold">{order.product}</div>
                          <div className="text-sm text-gray-600">by {order.supplier}</div>
                          <div className="text-green-600 font-bold">{order.pricePerKg}</div>
                          <div className="w-full h-1 bg-gray-200 rounded mt-1">
                            <div className="h-1 bg-green-500 rounded" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <button 
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
                          onClick={() => {
                            setSelectedGroup(order);
                          }}
                        >
                          View
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Profile Edit Modal */}
      {showProfileEditModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl border max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-semibold">Edit Profile</h2>
              <button 
                onClick={() => setShowProfileEditModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Business Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Business Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Full Name</label>
                    <input 
                      type="text" 
                      value={editFormData.fullName}
                      onChange={(e) => handleFormChange('fullName', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Stall Name</label>
                    <input 
                      type="text" 
                      value={editFormData.stallName}
                      onChange={(e) => handleFormChange('stallName', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Mobile Number</label>
                    <input 
                      type="text" 
                      value={editFormData.mobileNumber}
                      onChange={(e) => handleFormChange('mobileNumber', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Stall Type</label>
                    <select 
                      className="w-full border rounded px-3 py-2" 
                      value={editFormData.stallType}
                      onChange={(e) => handleFormChange('stallType', e.target.value)}
                    >
                      <option value="Chaat">Chaat</option>
                      <option value="South Indian">South Indian</option>
                      <option value="North Indian">North Indian</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Fast Food">Fast Food</option>
                      <option value="Beverages">Beverages</option>
                      <option value="Desserts">Desserts</option>
                      <option value="Street Food">Street Food</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2">Stall Address</label>
                    <textarea 
                      value={editFormData.stallAddress}
                      onChange={(e) => handleFormChange('stallAddress', e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">City</label>
                    <input 
                      type="text" 
                      value={editFormData.city}
                      onChange={(e) => handleFormChange('city', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">State</label>
                    <input 
                      type="text" 
                      value={editFormData.state}
                      onChange={(e) => handleFormChange('state', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Pincode</label>
                    <input 
                      type="text" 
                      value={editFormData.pincode}
                      onChange={(e) => handleFormChange('pincode', e.target.value)}
                      className="w-full border rounded px-3 py-2" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Language Preference</label>
                    <select 
                      className="w-full border rounded px-3 py-2" 
                      value={editFormData.languagePreference}
                      onChange={(e) => handleFormChange('languagePreference', e.target.value)}
                    >
                      <option value="Hindi">Hindi</option>
                      <option value="Marathi">Marathi</option>
                      <option value="English">English</option>
                      <option value="Gujarati">Gujarati</option>
                      <option value="Punjabi">Punjabi</option>
                      <option value="Bengali">Bengali</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Primary Email</label>
                    <input type="email" defaultValue={user?.email || ""} className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone Number</label>
                    <input type="tel" defaultValue={vendorProfile?.mobileNumber || ""} className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">WhatsApp</label>
                    <input type="tel" defaultValue={vendorProfile?.mobileNumber || ""} className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Alternative Phone</label>
                    <input type="tel" defaultValue="" className="w-full border rounded px-3 py-2" placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Preferences */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Preferences</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Delivery Preference</label>
                    <select 
                      className="w-full border rounded px-3 py-2" 
                      value={editFormData.preferredDeliveryTime}
                      onChange={(e) => handleFormChange('preferredDeliveryTime', e.target.value)}
                    >
                      <option value="Next Day Delivery">Next Day Delivery</option>
                      <option value="Same Day Delivery">Same Day Delivery</option>
                      <option value="Standard Delivery">Standard Delivery</option>
                      <option value="Morning (8-12 PM)">Morning (8-12 PM)</option>
                      <option value="Afternoon (12-6 PM)">Afternoon (12-6 PM)</option>
                      <option value="Evening (6-10 PM)">Evening (6-10 PM)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Raw Material Needs</label>
                    <input 
                      type="text" 
                      value={editFormData.rawMaterialNeeds}
                      onChange={(e) => handleFormChange('rawMaterialNeeds', e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter comma-separated values (e.g., Vegetables, Spices, Oil)"
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter multiple items separated by commas</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowProfileEditModal(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Location Settings Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md border">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-semibold">Location Settings</h2>
              <button 
                onClick={() => setShowLocationModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Current Location Status */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Current Location</h3>
                <div className="bg-gray-50 rounded-lg p-3">
                  {currentLocation ? (
                    <div>
                      <div className="flex items-center gap-2 text-green-600 mb-2">
                        <MapPin className="w-4 h-4" />
                        <span className="font-medium text-sm">Current Location Detected</span>
                      </div>
                      <p className="text-sm text-gray-700 font-medium mb-1">{currentLocation.name}</p>
                      <p className="text-xs text-gray-500">
                        Coordinates: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                        {currentLocation.accuracy && (
                          <span className="block mt-1">Accuracy: ±{Math.round(currentLocation.accuracy)} meters</span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">Location not detected</span>
                    </div>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={detectCurrentLocation}
                  disabled={isDetectingLocation}
                  className="w-full mt-3 flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  {isDetectingLocation ? "Detecting..." : "Detect Location Again"}
                </Button>
              </div>

              {/* Location Filter Settings */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Filter Preferences</h3>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="locationFilter"
                      value="all"
                      checked={locationFilter === "all"}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Show all groups</span>
                  </label>
                  
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="locationFilter"
                      value="nearby"
                      checked={locationFilter === "nearby"}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      disabled={!currentLocation}
                      className="w-4 h-4 text-green-600 disabled:opacity-50"
                    />
                    <span className={`text-sm ${!currentLocation ? 'text-gray-400' : ''}`}>
                      Show nearby groups only
                      {!currentLocation && " (location required)"}
                    </span>
                  </label>
                </div>
                
                {locationFilter === "nearby" && currentLocation && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Radius: {customLocationRadius}km
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={customLocationRadius}
                      onChange={(e) => setCustomLocationRadius(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1km</span>
                      <span>50km</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Location Permission Status */}
              {locationPermission === 'denied' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className="w-4 h-4 bg-yellow-400 rounded-full mt-0.5"></div>
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Location Access Denied</p>
                      <p className="text-xs text-yellow-600 mt-1">
                        To use location-based features, please enable location permissions in your browser settings.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowLocationModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  setShowLocationModal(false);
                  toast({
                    title: "Settings saved",
                    description: "Your location preferences have been updated.",
                  });
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Payment Modal */}
      {showPaymentModal && paymentDetails && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl border max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Complete Payment</h2>
                <p className="text-gray-600">Order ID: {paymentDetails.orderId}</p>
              </div>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Order Summary */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Order Summary</h3>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  {paymentDetails.type === 'individual' ? (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <img src={paymentDetails.supplier.image} alt={paymentDetails.product} className="w-12 h-12 object-cover rounded" />
                        <div>
                          <div className="font-semibold">{paymentDetails.product}</div>
                          <div className="text-sm text-gray-600">from {paymentDetails.supplier.name}</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Quantity:</span>
                          <span>{paymentDetails.quantity} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span>{formatAmount(paymentDetails.pricePerKg)}/kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{formatAmount(paymentDetails.subtotal)}</span>
                        </div>
                        {paymentDetails.deliveryCharge > 0 && (
                          <div className="flex justify-between">
                            <span>Delivery:</span>
                            <span>{formatAmount(paymentDetails.deliveryCharge)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>GST (5%):</span>
                          <span>{formatAmount(paymentDetails.tax)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total:</span>
                          <span>{formatAmount(paymentDetails.total)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-green-100 rounded flex items-center justify-center">
                          <Users className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <div className="font-semibold">{paymentDetails.group.product} (Group Order)</div>
                          <div className="text-sm text-gray-600">from {paymentDetails.group.supplier}</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Quantity:</span>
                          <span>{paymentDetails.quantity} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span>{formatAmount(paymentDetails.pricePerKg)}/kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{formatAmount(paymentDetails.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                          <span>Group Discount ({paymentDetails.group.discount}):</span>
                          <span>-{formatAmount(paymentDetails.groupDiscount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>After Discount:</span>
                          <span>{formatAmount(paymentDetails.discountedAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>GST (5%):</span>
                          <span>{formatAmount(paymentDetails.tax)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total:</span>
                          <span>{formatAmount(paymentDetails.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Delivery Information */}
                {currentLocation && paymentDetails.type === 'individual' && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Delivery Information</span>
                    </div>
                    <div className="text-xs text-blue-700">
                      <div>Delivering to: {currentLocation.name}</div>
                      <div>Distance: {getSupplierDistanceText(paymentDetails.supplier)}</div>
                      <div>Estimated delivery: 1-2 business days</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Choose Payment Method</h3>
                
                <div className="grid grid-cols-1 gap-3">
                  {/* Online Payment Button */}
                  <Button
                    onClick={() => processPayment('online')}
                    disabled={isProcessingPayment}
                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold"
                  >
                    {isProcessingPayment ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-6 h-6" />
                        <div className="text-left">
                          <div>Pay Online - {formatAmount(paymentDetails.total)}</div>
                          <div className="text-sm font-normal opacity-90">UPI • Cards • Net Banking • Wallets</div>
                        </div>
                      </div>
                    )}
                  </Button>

                  {/* Cash on Delivery */}
                  <Button
                    onClick={() => processPayment('cod')}
                    disabled={isProcessingPayment}
                    variant="outline"
                    className="w-full h-16 border-2 border-orange-400 hover:border-orange-500 hover:bg-orange-50 text-lg font-semibold"
                  >
                    {isProcessingPayment ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Truck className="w-6 h-6 text-orange-600" />
                        <div className="text-left">
                          <div className="text-gray-900">Cash on Delivery - {formatAmount(paymentDetails.total)}</div>
                          <div className="text-sm font-normal text-orange-600">Pay when you receive the order</div>
                        </div>
                      </div>
                    )}
                  </Button>

                  {/* COD Info for Group Orders */}
                  {paymentDetails.type === 'group' && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mt-2">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 text-orange-600 mt-0.5">💰</div>
                        <div>
                          <h4 className="font-medium text-orange-900">Group COD Order</h4>
                          <p className="text-sm text-orange-700 mt-1">
                            You're joining a group order with COD. Each member pays individually when their portion is delivered.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Security Notice */}
              <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">Secure Payment</span>
                </div>
                <p className="text-xs text-green-700 mt-1">
                  Your payment information is encrypted and secure. We don't store your payment details. Powered by Razorpay.
                </p>
              </div>

              {/* Razorpay Error Display */}
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-800 font-medium">Payment Service Error</span>
                  </div>
                  <p className="text-xs text-red-700 mt-1">
                    {typeof error === 'string' ? error : 'Unable to load payment service. Please refresh the page and try again.'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="px-6">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Success Modal */}
      {showPaymentSuccess && paymentSuccessData && (
        <PaymentSuccess
          {...paymentSuccessData}
          onContinueShopping={() => {
            setShowPaymentSuccess(false);
            setPaymentSuccessData(null);
          }}
        />
      )}
        </>
      )}
    </div>
    <Footer />
    </>
  );
};

export default VendorDashboard;