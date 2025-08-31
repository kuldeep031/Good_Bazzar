// Frontend API service for vendor product groups
const API_BASE_URL = 'http://localhost:5002/api/vendor-product-groups';

interface VendorProductGroupFilters {
  vendor_id?: string;
  group_id?: string;
  status?: string;
}

interface VendorProductGroupData {
  vendor_id: number;
  group_id: number;
  discount_per_unit?: number;
  maximum_price?: number; // Optional - will be auto-set to final_price in backend
  quantity: number;
  final_price: number;
  status?: string;
}

export const vendorProductGroupApi = {
  // Create a new vendor product group entry
  create: async (data: VendorProductGroupData) => {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create vendor product group: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Get all vendor product group entries with optional filters
  getAll: async (filters: VendorProductGroupFilters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.vendor_id) queryParams.append('vendor_id', filters.vendor_id);
      if (filters.group_id) queryParams.append('group_id', filters.group_id);
      if (filters.status) queryParams.append('status', filters.status);

      const url = queryParams.toString() ? `${API_BASE_URL}?${queryParams}` : API_BASE_URL;
      
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch vendor product groups: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Get a specific vendor product group entry
  getById: async (id: string | number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch vendor product group: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Update a vendor product group entry
  update: async (id: string | number, data: Partial<VendorProductGroupData>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to update vendor product group: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Delete a vendor product group entry
  delete: async (id: string | number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete vendor product group: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
};
