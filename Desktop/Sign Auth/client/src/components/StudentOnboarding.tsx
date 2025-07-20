import React, { useState } from 'react';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const countries = [
  'United States', 'Canada', 'United Kingdom', 'India', 'Pakistan', 'Australia', 'Bangladesh', 'Germany', 'France', 'Other'
];

const languageOptions = [
  'English', 'Spanish', 'French', 'German', 'Chinese', 'Hindi', 'Arabic', 'Bengali', 'Russian', 'Portuguese', 'Other'
];
const proficiencyOptions = ['Beginner', 'Intermediate', 'Advanced', 'Native'];

interface LanguageData {
  language: string;
  proficiency: string;
  speak: boolean;
  read: boolean;
  write: boolean;
  spokenAtHome: boolean;
}

interface OnboardingData {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  country: string;
  stateCity: string;
  gender: string;
  languages?: LanguageData[];
  numLanguages?: number;
  // Education fields
  highSchool?: string;
  gradYear?: string;
  classSize?: string;
  classRankReport?: string;
  gpaScale?: string;
  cumulativeGpa?: string;
  gpaWeighted?: string;
}

const StudentOnboarding: React.FC<{ onNext?: (data: OnboardingData) => void }> = ({ onNext }) => {
  const { updateProfile, reloadProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<OnboardingData>({
    firstName: '',
    lastName: '',
    dob: '',
    phone: '',
    country: '',
    stateCity: '',
    gender: '',
    numLanguages: 1,
    languages: [{ language: '', proficiency: '', speak: false, read: false, write: false, spokenAtHome: false }],
    highSchool: '',
    gradYear: '',
    classSize: '',
    classRankReport: '',
    gpaScale: '',
    cumulativeGpa: '',
    gpaWeighted: '',
  });
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePhoneChange = (value: string) => {
    setForm({ ...form, phone: value });
  };

  // Language page handlers
  const handleNumLanguagesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const num = parseInt(e.target.value, 10);
    setForm((prev) => ({
      ...prev,
      numLanguages: num,
      languages: Array(num).fill(null).map((_, i) => prev.languages && prev.languages[i] ? prev.languages[i] : { language: '', proficiency: '', speak: false, read: false, write: false, spokenAtHome: false })
    }));
  };

  const handleLanguageChange = (idx: number, field: keyof LanguageData, value: any) => {
    setForm((prev) => {
      const updated = prev.languages ? [...prev.languages] : [];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, languages: updated };
    });
  };

  const handleLangCheckbox = (idx: number, field: keyof LanguageData) => {
    setForm((prev) => {
      const updated = prev.languages ? [...prev.languages] : [];
      updated[idx] = { ...updated[idx], [field]: !updated[idx][field] };
      return { ...prev, languages: updated };
    });
  };

  const isEducationPageValid = () => {
    return !!(
      form.highSchool &&
      form.gradYear &&
      form.classSize &&
      form.classRankReport &&
      form.gpaScale &&
      form.cumulativeGpa &&
      form.gpaWeighted
    );
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      if (!form.firstName || !form.lastName || !form.dob || !form.phone || !form.country || !form.stateCity || !form.gender) {
        setError('Please fill in all fields.');
        return;
      }
      setError('');
      setPage(2);
    } else if (page === 2) {
      if (!form.numLanguages || !form.languages || form.languages.length !== form.numLanguages) {
        setError('Please complete all language fields.');
        return;
      }
      for (const lang of form.languages) {
        if (!lang.language || !lang.proficiency) {
          setError('Please select language and proficiency for each.');
          return;
        }
      }
      setError('');
      setPage(3);
    } else if (page === 3) {
      if (!isEducationPageValid()) {
        setError('Please fill in all education fields.');
        return;
      }
      setError('');
      setSubmitting(true);
      try {
        await updateProfile(form);
        // Call complete onboarding endpoint
        await axios.post('/api/auth/complete-onboarding', {}, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        await reloadProfile();
        setSubmitting(false);
        navigate('/student/welcome');
      } catch (err: any) {
        setError(err.message || 'Failed to submit onboarding.');
        setSubmitting(false);
      }
    }
  };

  const languageLabels = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

  const isLangPageValid = () => {
    if (!form.numLanguages || !form.languages || form.languages.length !== form.numLanguages) return false;
    for (const lang of form.languages) {
      if (!lang.language || !lang.proficiency) return false;
    }
    return true;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleNext} className="bg-white p-8 rounded-xl shadow-md w-full max-w-lg flex flex-col gap-6">
        {page === 1 && <>
          <div className="mb-2 text-sm text-blue-600 font-semibold">Step 1 of 2: Basic Information</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Student Onboarding</h1>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">First Name *</label>
              <input type="text" name="firstName" value={form.firstName} onChange={handleChange} className="input-field" required />
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">Last Name *</label>
              <input type="text" name="lastName" value={form.lastName} onChange={handleChange} className="input-field" required />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Date of Birth *</label>
            <input type="date" name="dob" value={form.dob} onChange={handleChange} className="input-field" required />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Phone Number (with country code) *</label>
            <PhoneInput
              country={'us'}
              value={form.phone}
              onChange={handlePhoneChange}
              inputClass="input-field"
              inputProps={{ required: true, name: 'phone' }}
              enableSearch
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Gender *</label>
            <div className="flex gap-6 mt-2">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={form.gender === 'male'}
                  onChange={handleChange}
                  className="form-radio text-blue-600"
                  required
                />
                <span className="ml-2">Male</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={form.gender === 'female'}
                  onChange={handleChange}
                  className="form-radio text-blue-600"
                  required
                />
                <span className="ml-2">Female</span>
              </label>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">Country *</label>
              <select name="country" value={form.country} onChange={handleChange} className="input-field" required>
                <option value="">Select Country</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">State/City *</label>
              <input type="text" name="stateCity" value={form.stateCity} onChange={handleChange} className="input-field" required />
            </div>
          </div>
        </>}
        {page === 2 && <>
          <div className="mb-2 text-sm text-blue-600 font-semibold">Step 2 of 2: Language Proficiency</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Language Proficiency</h1>
          <div>
            <label className="block text-gray-700 mb-1">Number of languages you are proficient in *</label>
            <select name="numLanguages" value={form.numLanguages} onChange={handleNumLanguagesChange} className="input-field" required>
              {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-4 mt-2">
            {form.languages && form.languages.map((lang, idx) => (
              <div key={idx} className="rounded-xl shadow-lg bg-white border border-slate-200 p-5 relative">
                <div className="absolute -top-3 left-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold shadow">{languageLabels[idx] || `Language ${idx+1}`}</div>
                <div className="flex gap-4 mb-2 mt-4">
                  <div className="flex-1">
                    <label className="block text-gray-700 mb-1">Select the language *</label>
                    <select
                      value={lang.language}
                      onChange={e => handleLanguageChange(idx, 'language', e.target.value)}
                      className="input-field"
                      required
                    >
                      <option value="">Select Language</option>
                      {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-gray-700 mb-1">Language proficiency *</label>
                    <select
                      value={lang.proficiency}
                      onChange={e => handleLanguageChange(idx, 'proficiency', e.target.value)}
                      className="input-field"
                      required
                    >
                      <option value="">Select Proficiency</option>
                      {proficiencyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4 mt-2">
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={lang.speak} onChange={() => handleLangCheckbox(idx, 'speak')} className="accent-blue-600 w-4 h-4" />
                    <span className="ml-2">Speak</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={lang.read} onChange={() => handleLangCheckbox(idx, 'read')} className="accent-blue-600 w-4 h-4" />
                    <span className="ml-2">Read</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={lang.write} onChange={() => handleLangCheckbox(idx, 'write')} className="accent-blue-600 w-4 h-4" />
                    <span className="ml-2">Write</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={lang.spokenAtHome} onChange={() => handleLangCheckbox(idx, 'spokenAtHome')} className="accent-blue-600 w-4 h-4" />
                    <span className="ml-2">Spoken at Home</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-6">
            <button type="button" className="btn-secondary px-6 py-2 rounded-lg font-semibold" onClick={() => setPage(1)}>
              Back
            </button>
            <button type="submit" className={`btn-primary px-8 py-2 rounded-lg font-semibold transition ${!isLangPageValid() ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!isLangPageValid()}>
              Submit
            </button>
          </div>
        </>}
        {page === 3 && <>
          <div className="mb-2 text-sm text-blue-600 font-semibold">Step 3 of 3: Education Information</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Education Information</h1>
          <div>
            <label className="block text-gray-700 mb-1">Current or Most Recent High School *</label>
            <input type="text" name="highSchool" value={form.highSchool} onChange={handleChange} className="input-field" required />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">High School Graduation Year *</label>
              <input type="number" name="gradYear" value={form.gradYear} onChange={handleChange} className="input-field" required min="1900" max="2100" />
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">Graduation Class Size (approx) *</label>
              <input type="number" name="classSize" value={form.classSize} onChange={handleChange} className="input-field" required min="1" />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Class Rank Report *</label>
            <select name="classRankReport" value={form.classRankReport} onChange={handleChange} className="input-field" required>
              <option value="">Select</option>
              <option value="reported">Yes, school reports rank</option>
              <option value="not_reported">No, school does not report rank</option>
            </select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">GPA Scale Reporting *</label>
              <select name="gpaScale" value={form.gpaScale} onChange={handleChange} className="input-field" required>
                <option value="">Select</option>
                <option value="4.0">4.0</option>
                <option value="5.0">5.0</option>
                <option value="100">100</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 mb-1">Cumulative GPA *</label>
              <input type="number" name="cumulativeGpa" value={form.cumulativeGpa} onChange={handleChange} className="input-field" required min="0" step="any" />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">GPA Weighted *</label>
            <select name="gpaWeighted" value={form.gpaWeighted} onChange={handleChange} className="input-field" required>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="flex justify-between mt-6">
            <button type="button" className="btn-secondary px-6 py-2 rounded-lg font-semibold" onClick={() => setPage(2)}>
              Back
            </button>
            <button type="submit" className={`btn-primary px-8 py-2 rounded-lg font-semibold transition ${!isEducationPageValid() || submitting ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!isEducationPageValid() || submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </>}
        {error && <div className="text-red-500 font-medium mt-2">{error}</div>}
        {page === 1 && <button type="submit" className="btn-primary w-full mt-4">Next</button>}
      </form>
    </div>
  );
};

export default StudentOnboarding; 