'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
  details?: {
    newContacts: number
    updatedContacts: number
    newTags: number
  }
}

export default function ContactsImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const targetFields = [
    { key: 'email', label: 'Email', required: true },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'fullName', label: 'Full Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State/Province' },
    { key: 'country', label: 'Country' },
    { key: 'tags', label: 'Tags (comma-separated)' },
    { key: 'skip', label: '— Skip this column —' },
  ]

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setResult(null)

    // Read and parse first few rows for preview
    const text = await selectedFile.text()
    const lines = text.split('\n').slice(0, 6) // Header + 5 rows
    const rows = lines.map(line => parseCSVLine(line))
    setPreview(rows)

    // Auto-detect column mapping
    if (rows.length > 0) {
      const headers = rows[0]
      const autoMapping: Record<string, string> = {}
      
      headers.forEach((header, index) => {
        const normalized = header.toLowerCase().trim()
        if (normalized.includes('email')) {
          autoMapping[index.toString()] = 'email'
        } else if (normalized === 'first name' || normalized === 'first_name' || normalized === 'firstname') {
          autoMapping[index.toString()] = 'firstName'
        } else if (normalized === 'last name' || normalized === 'last_name' || normalized === 'lastname') {
          autoMapping[index.toString()] = 'lastName'
        } else if (normalized === 'full name' || normalized === 'full_name' || normalized === 'fullname' || normalized === 'name') {
          autoMapping[index.toString()] = 'fullName'
        } else if (normalized.includes('phone')) {
          autoMapping[index.toString()] = 'phone'
        } else if (normalized === 'city') {
          autoMapping[index.toString()] = 'city'
        } else if (normalized === 'state' || normalized === 'province') {
          autoMapping[index.toString()] = 'state'
        } else if (normalized === 'country') {
          autoMapping[index.toString()] = 'country'
        } else if (normalized === 'tags' || normalized.includes('tag')) {
          autoMapping[index.toString()] = 'tags'
        } else {
          autoMapping[index.toString()] = 'skip'
        }
      })
      
      setColumnMapping(autoMapping)
    }
  }

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const handleImport = async () => {
    if (!file) return

    // Validate email column is mapped
    const emailMapped = Object.values(columnMapping).includes('email')
    if (!emailMapped) {
      alert('Please map at least one column to Email')
      return
    }

    setImporting(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mapping', JSON.stringify(columnMapping))

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['Failed to import: ' + (error instanceof Error ? error.message : 'Unknown error')],
      })
    } finally {
      setImporting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreview([])
    setColumnMapping({})
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/contacts" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Contacts
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Import Contacts</h1>

      {/* File Upload */}
      {!file && (
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-2xl">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="mt-4">
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-indigo-600 hover:text-indigo-500 font-medium">Upload a CSV file</span>
                <input
                  ref={fileInputRef}
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
              </label>
              <p className="text-gray-500 text-sm mt-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-400 mt-2">CSV files only</p>
          </div>

          <div className="mt-6 text-sm text-gray-500">
            <h3 className="font-medium text-gray-700 mb-2">Expected columns:</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Email</strong> (required)</li>
              <li>First Name, Last Name, or Full Name</li>
              <li>Phone, City, State, Country</li>
              <li>Tags (comma-separated)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Column Mapping */}
      {file && !result && (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-4xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Map Columns: {file.name}
            </h2>
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Choose different file
            </button>
          </div>

          {/* Preview Table */}
          {preview.length > 0 && (
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {preview[0].map((_, colIndex) => (
                      <th key={colIndex} className="px-3 py-2 text-left">
                        <select
                          value={columnMapping[colIndex.toString()] || 'skip'}
                          onChange={(e) => setColumnMapping({
                            ...columnMapping,
                            [colIndex.toString()]: e.target.value,
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {targetFields.map(field => (
                            <option key={field.key} value={field.key}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-50 font-medium' : ''}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 truncate max-w-[150px]">
                          {cell || <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {importing ? 'Importing...' : 'Import Contacts'}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={`bg-white rounded-xl shadow-sm p-6 max-w-2xl ${result.success ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'}`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {result.success ? '✓ Import Complete' : '✗ Import Failed'}
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-green-600">{result.imported}</p>
              <p className="text-sm text-green-700">Contacts imported</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
              <p className="text-sm text-gray-700">Skipped (duplicates/invalid)</p>
            </div>
          </div>

          {result.details && (
            <div className="text-sm text-gray-600 mb-4">
              <p>• {result.details.newContacts} new contacts</p>
              <p>• {result.details.updatedContacts} contacts updated</p>
              {result.details.newTags > 0 && <p>• {result.details.newTags} new tags created</p>}
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-red-600 mb-2">Errors:</p>
              <ul className="text-sm text-red-500 list-disc list-inside">
                {result.errors.slice(0, 10).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {result.errors.length > 10 && (
                  <li>...and {result.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Import More
            </button>
            <Link
              href="/contacts"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              View Contacts
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
