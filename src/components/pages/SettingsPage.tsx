import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Settings as SettingsIcon, 
  ArrowLeft,
  Wrench
} from 'lucide-react';

interface SettingsPageProps {
  userName: string;
}

export function SettingsPage({ userName }: SettingsPageProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="text-gray-600">Welcome, {userName} - Application preferences and configuration</p>
            </div>
          </div>
        </div>

        {/* Development Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Wrench className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Under Development</CardTitle>
                <CardDescription>
                  This page is currently being developed and will be available soon.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                <span>Route successfully created and functional</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Coming Features:</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">Profile</Badge>
                    <span className="text-sm text-gray-600">Manage account information</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">Notifications</Badge>
                    <span className="text-sm text-gray-600">Configure alert preferences</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">Security</Badge>
                    <span className="text-sm text-gray-600">Password and security settings</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">Appearance</Badge>
                    <span className="text-sm text-gray-600">Customize app theme and layout</span>
                  </div>
                </div>
              </div>
              <div className="text-center py-8">
                <SettingsIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Settings page will be available in the next update</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}