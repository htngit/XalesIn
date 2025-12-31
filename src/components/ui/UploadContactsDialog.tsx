import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { generateContactTemplate, parseContactsXLS, type ParsedContact } from '@/lib/utils/xlsHandler';
import { useServices } from '@/lib/services/ServiceContext';
import { toast } from '@/hooks/use-toast';


interface UploadContactsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

// LocalStorage keys
const STORAGE_KEY_CONTACTS = 'upload_dialog_parsed_contacts';
const STORAGE_KEY_MISSING_GROUPS = 'upload_dialog_missing_groups';

// Helper functions for localStorage
const saveToStorage = (key: string, data: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
};

const loadFromStorage = <T,>(key: string, fallback: T): T => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
        return fallback;
    }
};

const clearStorage = () => {
    localStorage.removeItem(STORAGE_KEY_CONTACTS);
    localStorage.removeItem(STORAGE_KEY_MISSING_GROUPS);
};

export function UploadContactsDialog({ open, onOpenChange, onSuccess }: UploadContactsDialogProps) {
    const { contactService, groupService } = useServices();
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Group verification state
    const [verifyingGroups, setVerifyingGroups] = useState(false);
    const [missingGroups, setMissingGroups] = useState<string[]>([]);
    const [showGroupConfirm, setShowGroupConfirm] = useState(false);

    // Validation state
    const [invalidContacts, setInvalidContacts] = useState<ParsedContact[]>([]);
    const [showValidationConfirm, setShowValidationConfirm] = useState(false);

    // Restore state from localStorage on mount (for HMR recovery)
    useEffect(() => {
        const storedContacts = loadFromStorage<ParsedContact[]>(STORAGE_KEY_CONTACTS, []);
        const storedMissing = loadFromStorage<string[]>(STORAGE_KEY_MISSING_GROUPS, []);
        if (storedContacts.length > 0) {
            setParsedContacts(storedContacts);
            console.log('Restored contacts from localStorage:', storedContacts.length);
        }
        if (storedMissing.length > 0) {
            setMissingGroups(storedMissing);
            console.log('Restored missing groups from localStorage:', storedMissing);
        }
    }, []);

    const validateContacts = (contacts: ParsedContact[]) => {
        const invalid: ParsedContact[] = [];
        const valid: ParsedContact[] = [];

        contacts.forEach(contact => {
            // Check if phone starts with +
            if (!contact.phone.startsWith('+')) {
                invalid.push(contact);
            } else {
                valid.push(contact);
            }
        });

        return { valid, invalid };
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setError(null);
        setIsParsing(true);
        setMissingGroups([]);
        setShowGroupConfirm(false);
        setInvalidContacts([]);
        setShowValidationConfirm(false);
        clearStorage(); // Clear any previous data

        try {
            const contacts = await parseContactsXLS(selectedFile);
            if (contacts.length === 0) {
                setError('No valid contacts found in the file. Please check the template.');
            } else {
                // Validate phone numbers
                const { invalid } = validateContacts(contacts);

                setParsedContacts(contacts); // Store all initially
                if (invalid.length > 0) {
                    setInvalidContacts(invalid);
                    setShowValidationConfirm(true);
                    // Temporarily store all, will filter on confirm
                    saveToStorage(STORAGE_KEY_CONTACTS, contacts); // Save to localStorage
                } else {
                    setParsedContacts(contacts);
                    saveToStorage(STORAGE_KEY_CONTACTS, contacts); // Save to localStorage
                    console.log('Parsed and saved contacts:', contacts.length);
                }
            }
        } catch (err) {
            console.error('Error parsing file:', err);
            setError('Failed to parse file. Please ensure it matches the template format.');
        } finally {
            setIsParsing(false);
        }
    };

    const proceedWithValidContacts = () => {
        const { valid } = validateContacts(parsedContacts);
        setParsedContacts(valid);
        saveToStorage(STORAGE_KEY_CONTACTS, valid);
        setShowValidationConfirm(false);
        // Reset file input to allow re-selection if needed? No, keep it.
    };

    const verifyGroups = async () => {
        setVerifyingGroups(true);
        setError(null);

        try {
            // Load from localStorage to ensure we have the data
            const currentContacts = loadFromStorage<ParsedContact[]>(STORAGE_KEY_CONTACTS, parsedContacts);
            console.log('verifyGroups - currentContacts:', currentContacts.length);

            // Re-validate just in case to be safe, though proceedWithValidContacts should have handled it
            const { valid } = validateContacts(currentContacts);
            if (valid.length === 0) {
                setError('No valid contacts to import.');
                setVerifyingGroups(false);
                return;
            }

            const uploadedGroupNames = new Set(valid.map(c => c.group_name).filter(Boolean) as string[]);

            if (uploadedGroupNames.size === 0) {
                // No groups in file, proceed directly
                await processUpload(false);
                return;
            }

            const existingGroups = await groupService.getGroups();
            const existingGroupNames = new Set(existingGroups.map(g => g.name.toLowerCase()));

            const missing = Array.from(uploadedGroupNames).filter(name => !existingGroupNames.has(name.toLowerCase()));

            if (missing.length > 0) {
                setMissingGroups(missing);
                saveToStorage(STORAGE_KEY_MISSING_GROUPS, missing); // Save to localStorage
                setShowGroupConfirm(true);
            } else {
                // All groups exist
                await processUpload(false);
            }
        } catch (error) {
            console.error('Error verifying groups:', error);
            setError('Failed to verify groups. Please try again.');
        } finally {
            setVerifyingGroups(false);
        }
    };

    const processUpload = async (createMissingGroups = false) => {
        console.log('processUpload called. createMissingGroups:', createMissingGroups);

        // Always load from localStorage to ensure we have the data
        const currentContacts = loadFromStorage<ParsedContact[]>(STORAGE_KEY_CONTACTS, []);
        const currentMissingGroups = loadFromStorage<string[]>(STORAGE_KEY_MISSING_GROUPS, []);

        console.log('currentContacts.length:', currentContacts.length);
        console.log('currentMissingGroups:', currentMissingGroups);

        // Double check validation
        const { valid } = validateContacts(currentContacts);

        if (valid.length === 0) {
            console.error('No valid contacts to upload - localStorage is empty or all invalid!');
            setError('No valid contacts to upload. Please re-select your file.');
            return;
        }

        setIsUploading(true);

        // Don't close immediately if creating groups - show loading on the confirm dialog
        if (!createMissingGroups) {
            setShowGroupConfirm(false);
        }

        try {
            console.log('Fetching latest groups...');
            // Get latest groups
            let groups = await groupService.getGroups();
            console.log('Groups fetched:', groups.length);

            // Create missing groups if requested
            if (createMissingGroups && currentMissingGroups.length > 0) {
                console.log('Entering creation block for:', currentMissingGroups);
                for (const groupName of currentMissingGroups) {
                    try {
                        console.log(`Creating group: ${groupName}`);
                        const newGroup = await groupService.createGroup({
                            name: groupName,
                            color: '#3b82f6', // Default blue
                            description: 'Created via bulk upload'
                        });
                        console.log(`Created group: ${groupName} -> ${newGroup.id}`);
                        groups.push(newGroup); // Add to our local groups array
                    } catch (error: any) {
                        if (error.message === 'Group name is already taken') {
                            console.log(`Group ${groupName} exists, retrieving ID...`);
                            // Fallback: find the existing group from fresh fetch
                            const freshGroups = await groupService.getGroups();
                            const existing = freshGroups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
                            if (existing) {
                                groups.push(existing); // Add existing group to our array
                                console.log(`Found existing group: ${groupName} -> ${existing.id}`);
                            } else {
                                console.warn(`Could not find group ${groupName} even after error.`);
                                // Don't throw - just continue. The group assignment will use 'default'.
                            }
                        } else {
                            console.error(`Failed to create group ${groupName}:`, error);
                            setError(`Failed to create group "${groupName}". Please ensure the name is valid.`);
                            setIsUploading(false);
                            return; // Stop process if group creation fails
                        }
                    }
                }
                // Refresh groups list after creation to ensure we have all IDs
                console.log('Refetching groups after creation...');
                groups = await groupService.getGroups();
                console.log('Groups refetched:', groups.length);

                // Now close the confirmation dialog as we proceed to main upload
                setShowGroupConfirm(false);
            } else {
                console.log('Skipping group creation block.');
            }

            // Map parsed contacts to creation payload
            const contactsToCreate = valid.map(c => {
                // Find group ID (case-insensitive match)
                const targetGroup = c.group_name
                    ? groups.find(g => g.name.toLowerCase() === c.group_name!.toLowerCase())
                    : null;

                if (c.group_name && !targetGroup) {
                    console.warn(`Group "${c.group_name}" still not found after creation attempt.`);
                }

                return {
                    name: c.name,
                    phone: c.phone,
                    group_id: targetGroup?.id, // undefined if no group found
                    tags: c.tags || [],
                    notes: c.notes || '',
                    is_blocked: false
                };
            });

            console.log('Creating contacts...', contactsToCreate.length);
            const result = await contactService.createContacts(contactsToCreate);

            if (result.success) {
                console.log('Contacts created successfully. Triggering sync...');
                toast({
                    title: "Upload Successful",
                    description: `Successfully imported ${result.created} contacts. Sync started.`,
                });

                // Clear localStorage on success
                clearStorage();
                onSuccess();
                handleClose();
            } else {
                console.error('Failed to create contacts:', result.errors);
                setError(`Failed to upload some contacts. ${result.errors[0] || ''}`);
            }
        } catch (err) {
            console.error('Upload failed:', err);
            setError('An unexpected error occurred during upload.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setParsedContacts([]);
        setInvalidContacts([]); // Clear invalid
        setError(null);
        setIsParsing(false);
        setIsUploading(false);
        setMissingGroups([]);
        setShowGroupConfirm(false);
        setShowValidationConfirm(false);
        clearStorage();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        onOpenChange(false);
    };

    return (
        <>
            <AlertDialog open={open} onOpenChange={handleClose}>
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Import Contacts</AlertDialogTitle>
                        <AlertDialogDescription>
                            Upload an Excel or CSV file to import contacts in bulk.
                            Supported formats: .xlsx, .xls, .csv
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={generateContactTemplate} className="w-full">
                                <Download className="mr-2 h-4 w-4" />
                                Download Template
                            </Button>
                        </div>

                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="dropzone-file"
                                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-700 ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        }`}
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        {isParsing ? (
                                            <Loader2 className="w-8 h-8 mb-2 text-gray-500 animate-spin" />
                                        ) : (
                                            <Upload className={`w-8 h-8 mb-2 ${error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`} />
                                        )}
                                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                            {file ? (
                                                <span className="font-semibold text-green-600">{file.name}</span>
                                            ) : (
                                                <>
                                                    <span className="font-semibold">Click to upload</span> or drag and drop
                                                </>
                                            )}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">XLSX, XLS or CSV</p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        id="dropzone-file"
                                        type="file"
                                        className="hidden"
                                        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                        onChange={handleFileChange}
                                        disabled={isParsing || isUploading}
                                    />
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-50 rounded-md dark:bg-red-900/10">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="text-sm text-muted-foreground">
                            {isParsing ? (
                                <p>Parsing file...</p>
                            ) : (
                                <div>
                                    {parsedContacts.length > 0 && !error && (
                                        <div className="flex items-center gap-2 text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <p>Ready to import <strong>{parsedContacts.length}</strong> contacts</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isUploading || verifyingGroups}>Cancel</AlertDialogCancel>
                        <Button
                            onClick={verifyGroups}
                            disabled={!file || isParsing || !!error || isUploading || parsedContacts.length === 0 || verifyingGroups || showValidationConfirm}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {isUploading || verifyingGroups ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    {isUploading ? 'Importing...' : 'Verifying...'}
                                </>
                            ) : (
                                'Import Contacts'
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Invalid Phone Numbers Warning Dialog */}
            <AlertDialog open={showValidationConfirm} onOpenChange={setShowValidationConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 text-red-600 mb-2">
                            <AlertCircle className="h-5 w-5" />
                            <AlertDialogTitle>Invalid Phone Numbers Detected</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="space-y-4">
                            <p>
                                The following contacts have invalid phone numbers (must start with '+'):
                            </p>
                            <div className="bg-muted p-3 rounded-md max-h-[150px] overflow-y-auto">
                                <ul className="list-disc pl-5 text-sm space-y-1">
                                    {invalidContacts.map((contact, index) => (
                                        <li key={index}>
                                            <span className="font-medium">{contact.name || 'Unknown'}</span>:
                                            <span className="text-red-500 ml-1">{contact.phone}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="text-sm border-l-4 border-amber-500 pl-3 py-1 bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-200">
                                <p className="font-semibold">Action Required:</p>
                                <p>You can proceed to import only the <strong>{parsedContacts.length - invalidContacts.length}</strong> valid contacts, or cancel to fix your file.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleClose}>Cancel Upload</AlertDialogCancel>
                        <Button
                            onClick={proceedWithValidContacts}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            Proceed with Valid Only
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Missing Groups Confirmation Dialog */}
            <AlertDialog open={showGroupConfirm} onOpenChange={setShowGroupConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 text-amber-600 mb-2">
                            <Info className="h-5 w-5" />
                            <AlertDialogTitle>New Groups Detected</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="space-y-4">
                            <p>
                                The following groups do not exist in your database:
                            </p>
                            <div className="bg-muted p-3 rounded-md max-h-[150px] overflow-y-auto">
                                <ul className="list-disc pl-5 text-sm">
                                    {missingGroups.map((group, index) => (
                                        <li key={index}>{group}</li>
                                    ))}
                                </ul>
                            </div>
                            <p>
                                Do you want to create these groups automatically?
                                <br />
                                <span className="text-xs text-muted-foreground">If you choose "No", the upload will be cancelled so you can correct your file.</span>
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setShowGroupConfirm(false); clearStorage(); }} disabled={isUploading}>
                            No, Cancel Upload
                        </AlertDialogCancel>
                        <Button
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => processUpload(true)}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Creating Groups...
                                </>
                            ) : (
                                'Yes, Create Groups & Import'
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
