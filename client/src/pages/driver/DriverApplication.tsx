import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Truck, Upload, User, FileText, CreditCard, CheckCircle, Loader2, ArrowLeft, ArrowRight, ChevronsUpDown, Check, Phone, Shield, AlertCircle, XCircle, Info, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PostcodeAutocomplete } from "@/components/PostcodeAutocomplete";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  "Afghan", "Albanian", "Algerian", "American", "Andorran", "Angolan", "Argentine", "Armenian", 
  "Australian", "Austrian", "Azerbaijani", "Bahamian", "Bahraini", "Bangladeshi", "Barbadian", 
  "Belarusian", "Belgian", "Belizean", "Beninese", "Bhutanese", "Bolivian", "Bosnian", "Brazilian", 
  "British", "Bruneian", "Bulgarian", "Burkinabe", "Burmese", "Burundian", "Cambodian", "Cameroonian", 
  "Canadian", "Cape Verdean", "Central African", "Chadian", "Chilean", "Chinese", "Colombian", 
  "Comoran", "Congolese", "Costa Rican", "Croatian", "Cuban", "Cypriot", "Czech", "Danish", 
  "Djiboutian", "Dominican", "Dutch", "Ecuadorean", "Egyptian", "Emirati", "English", "Equatorial Guinean", 
  "Eritrean", "Estonian", "Ethiopian", "Fijian", "Filipino", "Finnish", "French", "Gabonese", 
  "Gambian", "Georgian", "German", "Ghanaian", "Greek", "Grenadian", "Guatemalan", "Guinean", 
  "Guyanese", "Haitian", "Honduran", "Hungarian", "Icelandic", "Indian", "Indonesian", "Iranian", 
  "Iraqi", "Irish", "Israeli", "Italian", "Ivorian", "Jamaican", "Japanese", "Jordanian", 
  "Kazakh", "Kenyan", "Kiribati", "Korean", "Kosovar", "Kuwaiti", "Kyrgyz", "Laotian", 
  "Latvian", "Lebanese", "Liberian", "Libyan", "Liechtenstein", "Lithuanian", "Luxembourgish", 
  "Macedonian", "Malagasy", "Malawian", "Malaysian", "Maldivian", "Malian", "Maltese", "Marshallese", 
  "Mauritanian", "Mauritian", "Mexican", "Micronesian", "Moldovan", "Monegasque", "Mongolian", 
  "Montenegrin", "Moroccan", "Mozambican", "Namibian", "Nauruan", "Nepalese", "New Zealand", 
  "Nicaraguan", "Nigerian", "Nigerien", "Northern Irish", "Norwegian", "Omani", "Pakistani", 
  "Palauan", "Palestinian", "Panamanian", "Papua New Guinean", "Paraguayan", "Peruvian", "Polish", 
  "Portuguese", "Qatari", "Romanian", "Russian", "Rwandan", "Saint Lucian", "Salvadoran", "Samoan", 
  "Saudi", "Scottish", "Senegalese", "Serbian", "Seychellois", "Sierra Leonean", "Singaporean", 
  "Slovak", "Slovenian", "Solomon Islander", "Somali", "South African", "South Sudanese", "Spanish", 
  "Sri Lankan", "Sudanese", "Surinamese", "Swazi", "Swedish", "Swiss", "Syrian", "Taiwanese", 
  "Tajik", "Tanzanian", "Thai", "Togolese", "Tongan", "Trinidadian", "Tunisian", "Turkish", 
  "Turkmen", "Tuvaluan", "Ugandan", "Ukrainian", "Uruguayan", "Uzbek", "Vanuatuan", "Vatican", 
  "Venezuelan", "Vietnamese", "Welsh", "Yemeni", "Zambian", "Zimbabwean"
].sort();

const driverApplicationFormSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  postcode: z.string().min(3, "Valid postcode is required"),
  fullAddress: z.string().min(5, "Full address is required"),
  buildingName: z.string().optional(),
  nationality: z.string().min(2, "Nationality is required"),
  isBritish: z.boolean().default(false),
  nationalInsuranceNumber: z.string().min(9, "Valid National Insurance number is required"),
  rightToWorkShareCode: z.string().optional(),
  vehicleType: z.enum(["motorbike", "car", "small_van", "medium_van", "lwb_van", "luton_van"]),
  vehicleRegistration: z.string().min(2, "Vehicle registration number is required"),
  vehicleMake: z.string().min(1, "Vehicle make is required"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  vehicleColor: z.string().min(1, "Vehicle colour is required"),
  bankName: z.string().min(2, "Bank name is required"),
  accountHolderName: z.string().min(2, "Account holder name is required"),
  sortCode: z.string().regex(/^\d{2}-?\d{2}-?\d{2}$/, "Valid sort code is required (e.g., 12-34-56)"),
  accountNumber: z.string().regex(/^\d{8}$/, "Valid 8-digit account number is required"),
});

type DriverApplicationFormValues = z.infer<typeof driverApplicationFormSchema>;

const STEPS = [
  { id: 1, title: "Personal Details", icon: User },
  { id: 2, title: "Documents", icon: FileText },
  { id: 3, title: "Vehicle & Bank", icon: CreditCard },
  { id: 4, title: "Review", icon: CheckCircle },
];

export default function DriverApplication() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [step2Attempted, setStep2Attempted] = useState(false);
  
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  
  const [uploadedFiles, setUploadedFiles] = useState<{
    profilePicture: string | null;
    drivingLicenceFront: string | null;
    drivingLicenceBack: string | null;
    dbsCertificate: string | null;
    goodsInTransitInsurance: string | null;
    hireAndReward: string | null;
  }>({
    profilePicture: null,
    drivingLicenceFront: null,
    drivingLicenceBack: null,
    dbsCertificate: null,
    goodsInTransitInsurance: null,
    hireAndReward: null,
  });
  const [uploadedFileNames, setUploadedFileNames] = useState<Record<string, string>>({});
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const form = useForm<DriverApplicationFormValues>({
    resolver: zodResolver(driverApplicationFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      postcode: "",
      fullAddress: "",
      buildingName: "",
      nationality: "",
      isBritish: false,
      nationalInsuranceNumber: "",
      rightToWorkShareCode: "",
      vehicleType: "" as any,
      vehicleRegistration: "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleColor: "",
      bankName: "",
      accountHolderName: "",
      sortCode: "",
      accountNumber: "",
    },
  });

  const isBritish = form.watch("isBritish");

  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // ── Completion percentage ────────────────────────────────────────────────
  const getCompletionItems = () => {
    const values = form.getValues();
    const items = [
      { label: "Full name", done: !!values.fullName?.trim() },
      { label: "Email", done: !!values.email?.trim() },
      { label: "Phone (verified)", done: phoneVerified },
      { label: "Postcode", done: !!values.postcode?.trim() },
      { label: "Full address", done: !!values.fullAddress?.trim() },
      { label: "Nationality", done: !!values.nationality?.trim() },
      { label: "National Insurance number", done: !!values.nationalInsuranceNumber?.trim() },
      { label: "Right to work share code", done: values.isBritish ? true : !!values.rightToWorkShareCode?.trim() },
      { label: "Profile photo", done: !!uploadedFiles.profilePicture },
      { label: "Driving licence (front)", done: !!uploadedFiles.drivingLicenceFront },
      { label: "Driving licence (back)", done: !!uploadedFiles.drivingLicenceBack },
      { label: "Goods in transit insurance", done: !!uploadedFiles.goodsInTransitInsurance },
      { label: "Hire and reward insurance", done: !!uploadedFiles.hireAndReward },
      { label: "Vehicle type", done: !!values.vehicleType },
      { label: "Vehicle registration", done: !!values.vehicleRegistration?.trim() },
      { label: "Vehicle make", done: !!values.vehicleMake?.trim() },
      { label: "Vehicle model", done: !!values.vehicleModel?.trim() },
      { label: "Vehicle colour", done: !!values.vehicleColor?.trim() },
      { label: "Bank name", done: !!values.bankName?.trim() },
      { label: "Account holder name", done: !!values.accountHolderName?.trim() },
      { label: "Sort code", done: !!values.sortCode?.trim() },
      { label: "Account number", done: !!values.accountNumber?.trim() },
    ];
    const completed = items.filter(i => i.done).length;
    const percentage = Math.round((completed / items.length) * 100);
    return { items, completed, total: items.length, percentage };
  };

  // ── Draft save ────────────────────────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    const values = form.getValues();
    const email = values.email?.trim();
    if (!email) {
      toast({ title: "Email required", description: "Please enter your email address before saving progress.", variant: "destructive" });
      return;
    }
    setIsSavingDraft(true);
    try {
      const draftData = {
        ...values,
        profilePictureUrl: uploadedFiles.profilePicture,
        drivingLicenceFrontUrl: uploadedFiles.drivingLicenceFront,
        drivingLicenceBackUrl: uploadedFiles.drivingLicenceBack,
        dbsCertificateUrl: uploadedFiles.dbsCertificate,
        goodsInTransitInsuranceUrl: uploadedFiles.goodsInTransitInsurance,
        hireAndRewardUrl: uploadedFiles.hireAndReward,
      };
      const response = await apiRequest("POST", "/api/driver-applications/draft", draftData);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save draft");
      }
      const savedId = data.id || draftId;
      if (savedId) {
        setDraftId(savedId);
        localStorage.setItem("draftApplicationId", savedId);
        localStorage.setItem("draftApplicationEmail", email);
      }
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
      toast({ title: "Progress saved", description: "Your application progress has been saved. You can return to it anytime." });
    } catch (err: any) {
      toast({ title: "Could not save progress", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsSavingDraft(false);
    }
  }, [form, uploadedFiles, draftId, toast]);

  // ── Load draft on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const savedId = localStorage.getItem("draftApplicationId");
    if (!savedId) return;
    fetch(`/api/driver-applications/${savedId}`)
      .then(r => r.ok ? r.json() : null)
      .then((draft: any) => {
        if (!draft || draft.status !== 'draft') {
          localStorage.removeItem("draftApplicationId");
          localStorage.removeItem("draftApplicationEmail");
          return;
        }
        setDraftId(savedId);
        // Pre-fill form fields
        const fields: (keyof DriverApplicationFormValues)[] = [
          "fullName", "email", "phone", "postcode", "fullAddress", "buildingName",
          "nationality", "isBritish", "nationalInsuranceNumber", "rightToWorkShareCode",
          "vehicleType", "vehicleRegistration", "vehicleMake", "vehicleModel", "vehicleColor",
          "bankName", "accountHolderName", "sortCode", "accountNumber",
        ];
        const formValues: any = {};
        for (const f of fields) {
          const snakeKey = f.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
          const val = (draft as any)[f] ?? (draft as any)[snakeKey];
          if (val !== undefined && val !== null) formValues[f] = val;
        }
        form.reset({ ...form.getValues(), ...formValues });
        // Restore uploaded files
        setUploadedFiles({
          profilePicture: draft.profilePictureUrl || draft.profile_picture_url || null,
          drivingLicenceFront: draft.drivingLicenceFrontUrl || draft.driving_licence_front_url || null,
          drivingLicenceBack: draft.drivingLicenceBackUrl || draft.driving_licence_back_url || null,
          dbsCertificate: draft.dbsCertificateUrl || draft.dbs_certificate_url || null,
          goodsInTransitInsurance: draft.goodsInTransitInsuranceUrl || draft.goods_in_transit_insurance_url || null,
          hireAndReward: draft.hireAndRewardUrl || draft.hire_and_reward_url || null,
        });
        toast({ title: "Draft restored", description: "Your saved progress has been loaded. Continue where you left off." });
      })
      .catch(() => {});
  }, []);

  const uploadFile = useCallback(async (file: File, type: keyof typeof uploadedFiles) => {
    setIsUploading(true);
    setUploadingType(type);
    setUploadedFileNames(prev => ({ ...prev, [type]: file.name }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('driverId', 'application-pending');
      formData.append('documentType', type);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload document');
      }

      const data = await response.json();
      setUploadedFiles(prev => ({ ...prev, [type]: data.fileUrl }));
      toast({
        title: "File uploaded",
        description: "Your document has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadingType(null);
    }
  }, [toast]);

  const sendVerificationCode = useCallback(async () => {
    const phone = form.getValues("phone");
    if (!phone || phone.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number first.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await fetch("/api/auth/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setShowVerificationInput(true);
      setResendCountdown(60);
      
      const interval = setInterval(() => {
        setResendCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast({
        title: "Code sent",
        description: "A verification code has been sent to your phone.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to send code",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSendingCode(false);
    }
  }, [form, toast]);

  const verifyPhoneCode = useCallback(async () => {
    const phone = form.getValues("phone");
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setPhoneVerified(true);
      setPhoneVerificationToken(data.verificationToken);
      setShowVerificationInput(false);
      
      toast({
        title: "Phone verified",
        description: "Your phone number has been verified successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid verification code.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  }, [verificationCode, form, toast]);

  const submitApplicationMutation = useMutation({
    mutationFn: async (data: DriverApplicationFormValues) => {
      const applicationData = {
        ...data,
        phoneVerified,
        phoneVerificationToken,
        profilePictureUrl: uploadedFiles.profilePicture,
        drivingLicenceFrontUrl: uploadedFiles.drivingLicenceFront,
        drivingLicenceBackUrl: uploadedFiles.drivingLicenceBack,
        dbsCertificateUrl: uploadedFiles.dbsCertificate,
        goodsInTransitInsuranceUrl: uploadedFiles.goodsInTransitInsurance,
        hireAndRewardUrl: uploadedFiles.hireAndReward,
      };
      
      const response = await apiRequest("POST", "/api/driver-applications", applicationData);
      return response.json();
    },
    onSuccess: () => {
      localStorage.removeItem("draftApplicationId");
      localStorage.removeItem("draftApplicationEmail");
      toast({
        title: "Application submitted",
        description: "Your driver application has been submitted for review. We'll be in touch soon!",
      });
      navigate("/driver/application-success");
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error.message || "Failed to submit application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: keyof typeof uploadedFiles
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be re-selected
    e.target.value = '';

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    uploadFile(file, type);
  }, [uploadFile, toast]);

  const validateStep = async (step: number): Promise<boolean> => {
    switch (step) {
      case 1:
        const step1Fields: (keyof DriverApplicationFormValues)[] = ["fullName", "email", "phone", "postcode", "fullAddress", "nationality", "nationalInsuranceNumber"];
        
        const isStep1Valid = await form.trigger(step1Fields);
        
        if (!isStep1Valid) {
          const errors = form.formState.errors;
          const errorMessages: string[] = [];
          if (errors.fullName) errorMessages.push("Full Name");
          if (errors.email) errorMessages.push("Email");
          if (errors.phone) errorMessages.push("Phone Number");
          if (errors.postcode) errorMessages.push("Postcode");
          if (errors.fullAddress) errorMessages.push("Full Address");
          if (errors.nationality) errorMessages.push("Nationality");
          if (errors.nationalInsuranceNumber) errorMessages.push("National Insurance Number");
          
          if (errorMessages.length > 0) {
            toast({
              title: "Please complete required fields",
              description: `Missing or invalid: ${errorMessages.join(", ")}`,
              variant: "destructive",
            });
          }
          return false;
        }
        
        if (!phoneVerified) {
          toast({
            title: "Phone verification required",
            description: "Please verify your phone number before continuing.",
            variant: "destructive",
          });
          return false;
        }
        
        if (!isBritish) {
          const shareCode = form.getValues("rightToWorkShareCode");
          if (!shareCode || shareCode.trim().length < 9) {
            toast({
              title: "Right to Work Share Code required",
              description: "Non-British citizens must provide a valid UK Right to Work Share Code (at least 9 characters).",
              variant: "destructive",
            });
            return false;
          }
        }
        return true;
      case 2: {
        setStep2Attempted(true);
        const missingDocs: string[] = [];
        if (!uploadedFiles.profilePicture) missingDocs.push("Profile photo");
        if (!uploadedFiles.drivingLicenceFront) missingDocs.push("Driving licence (front)");
        if (!uploadedFiles.drivingLicenceBack) missingDocs.push("Driving licence (back)");
        if (!uploadedFiles.goodsInTransitInsurance) missingDocs.push("Goods in transit insurance");
        if (!uploadedFiles.hireAndReward) missingDocs.push("Hire and reward insurance");
        if (missingDocs.length > 0) {
          toast({
            title: "Required documents missing",
            description: `Please upload: ${missingDocs.join(", ")}. DBS certificate can be added later.`,
            variant: "destructive",
          });
          return false;
        }
        return true;
      }
      case 3:
        return form.trigger(["vehicleType", "vehicleRegistration", "vehicleMake", "vehicleModel", "vehicleColor", "bankName", "accountHolderName", "sortCode", "accountNumber"]);
      default:
        return true;
    }
  };

  const nextStep = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid && currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getSubmissionIssues = (): string[] => {
    const issues: string[] = [];
    const values = form.getValues();
    if (!values.fullName?.trim() || values.fullName.length < 2) issues.push("Full name");
    if (!values.email?.trim()) issues.push("Email address");
    if (!phoneVerified) issues.push("Phone number (must be verified)");
    if (!values.postcode?.trim()) issues.push("Postcode");
    if (!values.fullAddress?.trim()) issues.push("Full address");
    if (!values.nationality?.trim()) issues.push("Nationality");
    if (!values.nationalInsuranceNumber?.trim()) issues.push("National Insurance number");
    if (!values.isBritish && !values.rightToWorkShareCode?.trim()) issues.push("Right to work share code");
    if (!uploadedFiles.profilePicture) issues.push("Profile photo");
    if (!uploadedFiles.drivingLicenceFront) issues.push("Driving licence (front)");
    if (!uploadedFiles.drivingLicenceBack) issues.push("Driving licence (back)");
    if (!uploadedFiles.goodsInTransitInsurance) issues.push("Goods in transit insurance");
    if (!uploadedFiles.hireAndReward) issues.push("Hire and reward insurance");
    if (!values.vehicleType) issues.push("Vehicle type");
    if (!values.vehicleRegistration?.trim()) issues.push("Vehicle registration");
    if (!values.vehicleMake?.trim()) issues.push("Vehicle make");
    if (!values.vehicleModel?.trim()) issues.push("Vehicle model");
    if (!values.vehicleColor?.trim()) issues.push("Vehicle colour");
    if (!values.bankName?.trim()) issues.push("Bank name");
    if (!values.accountHolderName?.trim()) issues.push("Account holder name");
    if (!values.sortCode?.trim()) issues.push("Sort code");
    if (!values.accountNumber?.trim()) issues.push("Account number");
    return issues;
  };

  const onSubmit = (data: DriverApplicationFormValues) => {
    const issues = getSubmissionIssues();
    if (issues.length > 0) return;
    submitApplicationMutation.mutate(data);
  };

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const handleFileSelect = useCallback(async (
    file: File,
    type: keyof typeof uploadedFiles
  ) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrls(prev => ({ ...prev, [type]: url }));
    }

    uploadFile(file, type);
  }, [uploadFile, toast]);

  const ProfilePictureUpload = () => {
    const isThisUploading = uploadingType === 'profilePicture';
    const isUploaded = !!uploadedFiles.profilePicture;
    const preview = previewUrls.profilePicture;

    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground text-center">A clear photo of yourself for identification</p>
        <label className="cursor-pointer group relative">
          <div className={cn(
            "w-28 h-28 rounded-full overflow-visible flex items-center justify-center transition-all border-2",
            isUploaded ? "border-green-500" : "border-dashed border-muted-foreground/40",
            isThisUploading && "border-primary"
          )}>
            {preview ? (
              <img src={preview} alt="Profile" className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                {isThisUploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <>
                    <User className="h-8 w-8" />
                    <span className="text-xs">Tap to add</span>
                  </>
                )}
              </div>
            )}
          </div>
          {isUploaded && !isThisUploading && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
          )}
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx,.heic,.heif,.bmp,.tiff"
            capture="user"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleFileSelect(file, 'profilePicture');
            }}
            disabled={isThisUploading}
            className="hidden"
            data-testid="input-file-profilePicture"
          />
        </label>
        {isUploaded && (
          <label className="cursor-pointer text-xs text-primary hover:underline">
            Change photo
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.heic,.heif,.bmp,.tiff"
              capture="user"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleFileSelect(file, 'profilePicture');
              }}
              disabled={isThisUploading}
              className="hidden"
              data-testid="input-file-profilePicture-replace"
            />
          </label>
        )}
      </div>
    );
  };

  const FileUploadField = ({ 
    label, 
    type, 
    required = false,
    description,
    showError = false,
  }: { 
    label: string; 
    type: keyof typeof uploadedFiles;
    required?: boolean;
    description?: string;
    showError?: boolean;
  }) => {
    const isThisUploading = uploadingType === type;
    const isOtherUploading = isUploading && uploadingType !== type;
    const isUploaded = !!uploadedFiles[type];
    const fileName = uploadedFileNames[type];
    const preview = previewUrls[type];
    const hasError = required && !isUploaded && showError;

    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          {label}
          {required && <span className="text-destructive">*</span>}
          {isUploaded && <CheckCircle className="h-4 w-4 text-green-500" />}
          {hasError && <XCircle className="h-4 w-4 text-destructive" />}
        </Label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {hasError && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            This document is required before you can submit
          </p>
        )}
        {isUploaded ? (
          <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 p-3">
            {preview ? (
              <img src={preview} alt={label} className="h-10 w-10 rounded object-cover shrink-0" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            )}
            <span className="text-sm text-foreground truncate flex-1">{fileName || 'File uploaded'}</span>
            <label className="cursor-pointer shrink-0">
              <span className="text-sm text-primary hover:underline">Replace</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.heic,.heif,.bmp,.tiff"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleFileSelect(file, type);
                }}
                disabled={isThisUploading}
                className="hidden"
                data-testid={`input-file-${type}-replace`}
              />
            </label>
          </div>
        ) : (
          <label className={cn(
            "flex items-center gap-3 rounded-md border border-dashed p-4 cursor-pointer transition-colors",
            isThisUploading ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover-elevate",
            isOtherUploading && "opacity-60"
          )}>
            {isThisUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {isThisUploading ? 'Uploading...' : 'Choose file'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isThisUploading ? (fileName || '') : 'Image or PDF, max 10MB'}
              </span>
            </div>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.heic,.heif,.bmp,.tiff"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleFileSelect(file, type);
              }}
              disabled={isThisUploading}
              className="hidden"
              data-testid={`input-file-${type}`}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <PublicLayout>
      <div className="container mx-auto py-8 px-4 max-w-3xl">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Become a Driver</h1>
          <p className="text-muted-foreground mt-2">
            Join our delivery network and start earning on your own schedule.
          </p>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="flex flex-col items-center flex-1">
                  <div 
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : isCompleted 
                          ? "bg-green-500 text-white" 
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={`text-sm ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Tell us about yourself so we can verify your identity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" {...field} data-testid="input-full-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          Phone Number *
                          {phoneVerified && (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-normal">
                              <Shield className="h-3 w-3" />
                              Verified
                            </span>
                          )}
                        </FormLabel>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <FormControl>
                              {phoneVerified ? (
                                <div className="flex items-center h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground">
                                  {field.value}
                                </div>
                              ) : (
                                <PhoneInput 
                                  value={field.value} 
                                  onChange={field.onChange} 
                                  onBlur={field.onBlur} 
                                  name={field.name} 
                                  data-testid="input-phone"
                                />
                              )}
                            </FormControl>
                            {!phoneVerified ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={sendVerificationCode}
                                disabled={isSendingCode || !field.value || field.value.length < 10}
                                data-testid="button-send-code"
                              >
                                {isSendingCode ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Phone className="h-4 w-4 mr-1" />
                                )}
                                {showVerificationInput ? (resendCountdown > 0 ? `Resend (${resendCountdown}s)` : "Resend") : "Verify"}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPhoneVerified(false);
                                  setPhoneVerificationToken(null);
                                  setShowVerificationInput(false);
                                  setVerificationCode("");
                                }}
                                data-testid="button-change-phone"
                              >
                                Change
                              </Button>
                            )}
                          </div>
                          
                          {showVerificationInput && !phoneVerified && (
                            <div className="flex gap-2 p-3 bg-muted rounded-md">
                              <Input
                                type="text"
                                placeholder="Enter 6-digit code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-32"
                                maxLength={6}
                                data-testid="input-verification-code"
                              />
                              <Button
                                type="button"
                                onClick={verifyPhoneCode}
                                disabled={isVerifying || verificationCode.length !== 6}
                                data-testid="button-verify-code"
                              >
                                {isVerifying ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                )}
                                Verify
                              </Button>
                            </div>
                          )}
                        </div>
                        <FormDescription>
                          {phoneVerified 
                            ? "Your phone number is verified." 
                            : "We'll send a verification code to confirm your phone number."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postcode *</FormLabel>
                        <FormControl>
                          <PostcodeAutocomplete
                            value={field.value}
                            onChange={(postcode, fullAddress) => {
                              field.onChange(postcode);
                              if (fullAddress && !form.getValues("fullAddress")) {
                                form.setValue("fullAddress", fullAddress);
                              }
                            }}
                            placeholder="Start typing postcode..."
                            data-testid="input-postcode"
                          />
                        </FormControl>
                        <FormDescription>
                          Start typing to see address suggestions
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fullAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Address *</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Example Street, London" {...field} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="buildingName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Building Name (if applicable)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Tower Block A" {...field} data-testid="input-building-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nationality"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Nationality *</FormLabel>
                          <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={nationalityOpen}
                                  className={cn(
                                    "w-full justify-between",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="input-nationality"
                                >
                                  {field.value || "Select nationality..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0">
                              <Command>
                                <CommandInput placeholder="Search nationality..." />
                                <CommandList>
                                  <CommandEmpty>No nationality found.</CommandEmpty>
                                  <CommandGroup>
                                    {COUNTRIES.map((country) => (
                                      <CommandItem
                                        key={country}
                                        value={country}
                                        onSelect={() => {
                                          field.onChange(country);
                                          setNationalityOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === country ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {country}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nationalInsuranceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>National Insurance Number *</FormLabel>
                          <FormControl>
                            <Input placeholder="AB123456C" {...field} data-testid="input-ni-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="isBritish"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-is-british"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>I am a British citizen</FormLabel>
                          <FormDescription>
                            If you are not a British citizen, you will need to provide your Right to Work Share Code.
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {!isBritish && (
                    <FormField
                      control={form.control}
                      name="rightToWorkShareCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Right to Work Share Code *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter your 9-character share code" 
                              {...field} 
                              data-testid="input-share-code"
                            />
                          </FormControl>
                          <FormDescription>
                            Enter your UK Right to Work Share Code from the gov.uk online service.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Required Documents
                  </CardTitle>
                  <CardDescription>
                    Please upload clear photos or scans of the following documents. Files must be less than 10MB.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">
                      All documents marked <span className="text-destructive font-medium">*</span> are required before you can submit.{" "}
                      <span className="font-medium">DBS certificate is optional</span> — you can upload it later.
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <Label className="text-base font-medium flex items-center gap-1">
                      Profile Photo <span className="text-destructive">*</span>
                      {uploadedFiles.profilePicture && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {step2Attempted && !uploadedFiles.profilePicture && <XCircle className="h-4 w-4 text-destructive" />}
                    </Label>
                    {step2Attempted && !uploadedFiles.profilePicture && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        A profile photo is required before you can submit
                      </p>
                    )}
                    <ProfilePictureUpload />
                  </div>

                  <div className="border-t pt-6" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FileUploadField
                      label="Driving Licence (Front)"
                      type="drivingLicenceFront"
                      required
                      showError={step2Attempted}
                      description="Front side of your UK driving licence"
                    />
                    <FileUploadField
                      label="Driving Licence (Back)"
                      type="drivingLicenceBack"
                      required
                      showError={step2Attempted}
                      description="Back side of your UK driving licence"
                    />
                  </div>

                  <FileUploadField
                    label="DBS Certificate"
                    type="dbsCertificate"
                    description="Disclosure and Barring Service certificate — optional, can be uploaded later"
                  />

                  <FileUploadField
                    label="Goods in Transit Insurance"
                    type="goodsInTransitInsurance"
                    required
                    showError={step2Attempted}
                    description="Proof of goods in transit insurance coverage"
                  />

                  <FileUploadField
                    label="Hire and Reward Insurance"
                    type="hireAndReward"
                    required
                    showError={step2Attempted}
                    description="Proof of hire and reward insurance coverage"
                  />
                </CardContent>
              </Card>
            )}

            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Vehicle & Payment Details
                  </CardTitle>
                  <CardDescription>
                    Select your vehicle type and provide bank details for payments.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vehicle-type">
                              <SelectValue placeholder="Select your vehicle type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="motorbike">Motorbike (up to 5kg)</SelectItem>
                            <SelectItem value="car">Car (up to 50kg)</SelectItem>
                            <SelectItem value="small_van">Small Van (up to 400kg)</SelectItem>
                            <SelectItem value="medium_van">Medium Van (up to 750kg)</SelectItem>
                            <SelectItem value="lwb_van">LWB Van (up to 1000kg)</SelectItem>
                            <SelectItem value="luton_van">Luton Van (up to 1200kg)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose the vehicle type you will use for deliveries
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleRegistration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Registration Number *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. AB12 CDE" 
                            {...field} 
                            className="uppercase"
                            data-testid="input-vehicle-registration"
                          />
                        </FormControl>
                        <FormDescription>
                          Enter your vehicle registration number (number plate)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="vehicleMake"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Make *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. Ford" 
                              {...field}
                              data-testid="input-vehicle-make"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Model *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. Transit" 
                              {...field}
                              data-testid="input-vehicle-model"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Colour *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. White" 
                              {...field}
                              data-testid="input-vehicle-color"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Bank Details
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your earnings will be paid directly to this account.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="bankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bank Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Barclays" {...field} data-testid="input-bank-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accountHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Holder Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="John Smith" {...field} data-testid="input-account-holder" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <FormField
                        control={form.control}
                        name="sortCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sort Code *</FormLabel>
                            <FormControl>
                              <Input placeholder="12-34-56" {...field} data-testid="input-sort-code" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Account Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="12345678" {...field} data-testid="input-account-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep === 4 && (() => {
              const submissionIssues = getSubmissionIssues();
              const isReady = submissionIssues.length === 0;
              const completion = getCompletionItems();
              const docMeta: Record<string, { label: string; required: boolean }> = {
                profilePicture: { label: "Profile Photo", required: true },
                drivingLicenceFront: { label: "Driving Licence (Front)", required: true },
                drivingLicenceBack: { label: "Driving Licence (Back)", required: true },
                dbsCertificate: { label: "DBS Certificate", required: false },
                goodsInTransitInsurance: { label: "Goods in Transit Insurance", required: true },
                hireAndReward: { label: "Hire and Reward Insurance", required: true },
              };
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Review Your Application
                    </CardTitle>
                    <CardDescription>
                      Please review your information before submitting.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">

                    {/* Completion progress bar */}
                    <div data-testid="completion-progress">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">Application completion</span>
                        <span className={`text-sm font-semibold ${completion.percentage === 100 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid="text-completion-percentage">
                          {completion.percentage}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${completion.percentage === 100 ? 'bg-green-500' : completion.percentage >= 75 ? 'bg-yellow-500' : 'bg-destructive'}`}
                          style={{ width: `${completion.percentage}%` }}
                          data-testid="bar-completion"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{completion.completed} of {completion.total} required items completed</p>
                    </div>

                    {isReady ? (
                      <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-start gap-2" data-testid="banner-ready-to-submit">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-green-700 dark:text-green-400">Your application is complete and ready to submit.</p>
                          <p className="text-green-600 dark:text-green-500 mt-0.5">DBS certificate is optional — you can upload it later if needed.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3" data-testid="banner-incomplete">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-destructive">You must complete all required fields before submitting.</p>
                            <p className="text-muted-foreground mt-0.5">DBS certificate can be added later. Go back to previous steps to fill in the missing items.</p>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1">
                          {submissionIssues.map(issue => (
                            <li key={issue} className="flex items-center gap-2 text-sm text-destructive" data-testid={`missing-${issue.replace(/\s+/g, '-').toLowerCase()}`}>
                              <XCircle className="h-3 w-3 shrink-0" />
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-foreground mb-3">Personal Details</h4>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Full Name:</dt>
                            <dd className="font-medium" data-testid="text-review-name">{form.getValues("fullName")}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Email:</dt>
                            <dd className="font-medium" data-testid="text-review-email">{form.getValues("email")}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Phone:</dt>
                            <dd className="font-medium flex items-center gap-1">
                              {form.getValues("phone")}
                              {phoneVerified && (
                                <Shield className="h-3 w-3 text-green-600" />
                              )}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Postcode:</dt>
                            <dd className="font-medium">{form.getValues("postcode")}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Nationality:</dt>
                            <dd className="font-medium">{form.getValues("nationality")}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">British Citizen:</dt>
                            <dd className="font-medium">{form.getValues("isBritish") ? "Yes" : "No"}</dd>
                          </div>
                          {!isBritish && (
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Right to Work Share Code:</dt>
                              <dd className="font-medium">{form.getValues("rightToWorkShareCode") || <span className="text-destructive text-xs">Missing</span>}</dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      <div>
                        <h4 className="font-medium text-foreground mb-3">Documents</h4>
                        <ul className="space-y-2 text-sm">
                          {Object.entries(docMeta).map(([key, meta]) => {
                            const uploaded = !!uploadedFiles[key as keyof typeof uploadedFiles];
                            const isMissing = meta.required && !uploaded;
                            return (
                              <li key={key} className="flex items-center gap-2">
                                {uploaded ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                ) : isMissing ? (
                                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />
                                )}
                                <span className={isMissing ? "text-destructive font-medium" : uploaded ? "text-foreground" : "text-muted-foreground"}>
                                  {meta.label}
                                  {meta.required ? <span className="text-destructive ml-0.5">*</span> : <span className="text-muted-foreground ml-1 text-xs">(optional)</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-xs text-muted-foreground mt-3">
                          <span className="text-destructive">*</span> Required before submission
                        </p>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium text-foreground mb-3">Vehicle</h4>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Type:</dt>
                              <dd className="font-medium capitalize" data-testid="text-review-vehicle">{(form.getValues("vehicleType") || '').replace(/_/g, " ")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Registration:</dt>
                              <dd className="font-medium uppercase" data-testid="text-review-registration">{form.getValues("vehicleRegistration")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Make:</dt>
                              <dd className="font-medium" data-testid="text-review-make">{form.getValues("vehicleMake")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Model:</dt>
                              <dd className="font-medium" data-testid="text-review-model">{form.getValues("vehicleModel")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Colour:</dt>
                              <dd className="font-medium" data-testid="text-review-color">{form.getValues("vehicleColor")}</dd>
                            </div>
                          </dl>
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground mb-3">Bank Details</h4>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Bank:</dt>
                              <dd className="font-medium">{form.getValues("bankName")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Account Holder:</dt>
                              <dd className="font-medium">{form.getValues("accountHolderName")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Sort Code:</dt>
                              <dd className="font-medium">{form.getValues("sortCode")}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Account Number:</dt>
                              <dd className="font-medium">****{form.getValues("accountNumber").slice(-4)}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 text-sm">
                      <p className="text-muted-foreground">
                        By submitting this application, you confirm that all information provided is accurate 
                        and that you have the legal right to work in the United Kingdom. Your application will 
                        be reviewed by our team and we will contact you within 2-3 business days.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              {currentStep > 1 ? (
                <Button type="button" variant="outline" onClick={prevStep} data-testid="button-prev-step">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {/* Save Progress button — available on all steps */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveDraft}
                  disabled={isSavingDraft}
                  data-testid="button-save-draft"
                >
                  {isSavingDraft ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : draftSaved ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {draftSaved ? "Saved!" : "Save Progress"}
                </Button>

                {currentStep < 4 ? (
                  <Button type="button" onClick={nextStep} data-testid="button-next-step">
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitApplicationMutation.isPending || getSubmissionIssues().length > 0}
                    data-testid="button-submit-application"
                  >
                    {submitApplicationMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : getSubmissionIssues().length > 0 ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Complete Required Fields
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Submit Application
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </PublicLayout>
  );
}
