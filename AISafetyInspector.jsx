import React, { useState, useRef, useEffect } from 'react';

const apiKey = ""; // 執行環境會自動提供 API Key

export default function App() {
  const [activeTab, setActiveTab] = useState('audit');
  const [imagePreviews, setImagePreviews] = useState([]);
  const [imagesBase64, setImagesBase64] = useState([]);
  const [location, setLocation] = useState([]); 
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [auditFocus, setAuditFocus] = useState(["綜合稽核"]);
  const [workflowType, setWorkflowType] = useState("日常隱患排查"); 
  const [siteNotes, setSiteNotes] = useState("");
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false); 
  const [analysisResult, setAnalysisResult] = useState(null);
  const [records, setRecords] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);

  const locationOptions = ["裝配課", "加工課", "生管課", "設備課", "生技課", "總務課", "研發課"];
  const focusOptions = ["綜合稽核", "專案 6S 稽核", "設備 TPM 專項", "消防逃生專項", "職安衛防護專項"];
  const workflowOptions = ["日常隱患排查", "新專案作業審查", "變更管理稽核"]; 

  useEffect(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const filteredRecords = records.filter(record => {
      const recordDate = new Date(record.id); 
      return recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear;
    });

    if (filteredRecords.length !== records.length) {
      setRecords(filteredRecords);
    }
  }, [records]);

  const toggleLocation = (loc) => {
    setLocation(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  const toggleAuditFocus = (focus) => {
    setAuditFocus(prev =>
      prev.includes(focus) ? prev.filter(f => f !== focus) : [...prev, focus]
    );
  };

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const validFiles = files.filter(file => file.type.startsWith('image/'));
    if (validFiles.length !== files.length) {
      setErrorMsg("部分檔案格式不符，僅支援圖片檔案");
    }

    const readImage = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            preview: reader.result,
            base64: reader.result.split(',')[1]
          });
        };
        reader.readAsDataURL(file);
      });
    };

    const results = await Promise.all(validFiles.map(readImage));
    
    setImagePreviews(prev => [...prev, ...results.map(r => r.preview)]);
    setImagesBase64(prev => [...prev, ...results.map(r => r.base64)]);
    
    if (validFiles.length > 0) setErrorMsg("");
    setAnalysisResult(null);
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (indexToRemove) => {
    setImagePreviews(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setImagesBase64(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      if (!window.html2pdf) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const element = resultRef.current;
      const opt = {
        margin:       [12, 10, 15, 10], 
        filename:     `現場安全隱患識別報告_${location.join('_')}.pdf`,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2, useCORS: true, scrollY: 0 }, 
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }, 
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      await window.html2pdf().set(opt).from(element).save();
    } catch (error) {
      setErrorMsg("PDF 產生失敗，請稍後再試。");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const exportToCSV = () => {
    if (records.length === 0) {
      alert("目前沒有紀錄可供匯出");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "稽核日期,管理流程,地點,負責人,稽核焦點,風險等級,缺失類別,缺失描述,法規標準,改善對策,預計完成日,處理狀態\n"; 

    records.forEach(record => {
      record.result.reports?.forEach(report => {
        report.issues?.forEach(issue => {
          const isNoIssue = !issue.description || issue.description.trim() === '無' || issue.description.trim() === '無明顯缺失';
          if (isNoIssue) return; 

          const escapeCSV = (str) => `"${(str || '').replace(/"/g, '""')}"`;
          const row = [
            record.timestamp.split(' ')[0],
            escapeCSV(record.workflowType), 
            escapeCSV(record.location),
            escapeCSV(record.responsiblePerson),
            escapeCSV(record.auditFocus),
            escapeCSV(issue.riskLevel),
            escapeCSV(issue.category),
            escapeCSV(issue.description),
            escapeCSV(issue.standardReference),
            escapeCSV(issue.recommendation),
            escapeCSV(issue.dueDate || ''),
            escapeCSV(issue.status || '待處理')
          ].join(",");
          
          csvContent += row + "\n";
        });
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `環安衛缺失追蹤報表_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateIssueStatus = (recordId, photoIndex, issueIndex, field, value) => {
    const timestamp = new Date().toLocaleString('zh-TW');

    setRecords(prevRecords => 
      prevRecords.map(record => {
        if (record.id === recordId) {
          const newReports = [...record.result.reports];
          const reportToUpdate = newReports.find(r => r.photoIndex === photoIndex);
          if (reportToUpdate && reportToUpdate.issues) {
             const issue = reportToUpdate.issues[issueIndex];
             issue[field] = value;
             
             if (field === 'status') {
               if (!issue.logs) issue.logs = [];
               let actionDetail = `變更狀態為【${value}】`;
               if (value === '已派發') actionDetail = `將隱患【已派發】責成相關人員處理`;
               if (value === '已銷項') actionDetail = `確認整改完成，予以【已銷項】結案`;
               
               issue.logs.push({ time: timestamp, action: actionDetail });
             }
          }
          return { ...record, result: { ...record.result, reports: newReports } };
        }
        return record;
      })
    );

    if (analysisResult) {
       const newReports = [...analysisResult.reports];
       const reportToUpdate = newReports.find(r => r.photoIndex === photoIndex);
       if (reportToUpdate && reportToUpdate.issues) {
           const issue = reportToUpdate.issues[issueIndex];
           issue[field] = value;
       }
       setAnalysisResult({ ...analysisResult, reports: newReports });
    }
  };

  const analyzeImage = async () => {
    if (imagesBase64.length === 0) {
      setErrorMsg("請先上傳現場照片");
      return;
    }
    if (location.length === 0 || !responsiblePerson) {
      setErrorMsg("請選擇地點區域與填寫負責人資訊");
      return;
    }
    if (auditFocus.length === 0) {
      setErrorMsg("請至少選擇一項稽核焦點");
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg("");

    const promptText = `本次作業的管理流程為：【${workflowType}】，主要的稽核焦點為：【${auditFocus.join('、')}】。${siteNotes ? `\n另外，現場稽核員補充備註如下：「${siteNotes}」，請將此資訊納入綜合判斷。` : ''}

【極度重要】：本次一共上傳了 ${imagesBase64.length} 張照片。

請以台灣工廠廠務、環境安全衛生 (環安衛) 及消防管理稽核專家的身分，逐一檢視這 ${imagesBase64.length} 張現場照片。
請針對「每一張照片」，務必「依序」且獨立地檢視以下四個核心面向：
1. 【6S】 (重點在整理、整頓、清潔、安全)
2. 【TPM】 (重點在尋找微缺陷、汙染源與清掃困難處)
3. 【職業安全】 (請依據台灣職安衛法規，留意感電、墜落、切割夾捲等危害)
4. 【消防】 (請依據台灣消防法規，留意避難逃生動線是否受阻、消防設備周邊是否淨空)

請注意以下要求：
1. 必須使用繁體中文 (台灣用語)。
2. 絕對不可使用任何表情符號。
3. 絕對不可使用橫線及減號。
4. 【強制要求】您的回傳結果 reports 陣列中，必須包含正好 ${imagesBase64.length} 個物件。請務必針對每一張照片(照片 1 到照片 ${imagesBase64.length}) 分別獨立產出對應的報告，絕對不可將多張照片合併，也絕對不可遺漏任何一張照片。
5. 【強制要求】每張照片的 issues 陣列中，必須「固定包含四個物件」，其 category 必須分別精準對應：「6S」、「TPM」、「職業安全」、「消防」。
6. 若某個類別真的沒有發現缺失，請將該類別的 description 填寫為「無」，其他欄位(riskLevel、standardReference、recommendation)請一律填寫為「無」，絕對不可省略該類別的物件。
7. 若有發現缺失，其「缺失描述」與「改善對策」的內容，絕對不可寫成一整段文字，請務必採用「條列式 (使用 1. 2. 3. 等數字編號)」分段分項說明。
8. 結合「${workflowType}」的特性，發揮極致觀察力巨細靡遺盤點，將有疑慮的地方完整指出。`;

    const systemInstruction = "你是一位嚴格的廠務與環安衛稽核員。請勿使用表情符號，請使用台灣繁體中文。請以專業、客觀的語氣輸出結果。";

    const parts = [{ text: promptText }];
    imagesBase64.forEach((base64, index) => {
      parts.push({ text: `這是照片 ${index + 1}：` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
    });

    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: parts }],
      tools: [{ google_search: {} }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            overallSummary: { type: "STRING", description: "綜合稽核總評" },
            reports: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  photoIndex: { type: "INTEGER", description: "對應的照片序號" },
                  assessment: { type: "STRING", description: "該張照片的整體評估" },
                  issues: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        category: { type: "STRING", description: "類別，如 6S、TPM、職業安全、消防" },
                        riskLevel: { type: "STRING", description: "風險等級：高風險、中風險 或 低風險" },
                        description: { type: "STRING", description: "具體指出的問題狀況或填寫無" },
                        standardReference: { type: "STRING", description: "明確指出參考的法規名稱或業界標準" },
                        recommendation: { type: "STRING", description: "具體的行動方案與改善對策" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    let attempt = 0;
    const maxRetries = 5;
    const retryDelays = [1000, 2000, 4000, 8000, 16000];

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API 請求失敗: ${response.status}`);

        const data = await response.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (textContent) {
          let parsedResult;
          try {
             const cleanedText = textContent.replace(/```json\n?|\n?```/g, '').trim();
             parsedResult = JSON.parse(cleanedText);
             
             const currentTimestamp = new Date().toLocaleString('zh-TW');

             parsedResult.reports?.forEach(report => {
                report.issues?.forEach(issue => {
                    issue.status = '已上報'; 
                    issue.dueDate = '';
                    issue.logs = [{
                      time: currentTimestamp,
                      action: `發現隱患，完成線上【已上報】作業`
                    }];
                });
             });
          } catch (e) {
             throw new Error("解析 AI 回傳資料失敗");
          }

          setAnalysisResult(parsedResult);
          
          const newRecord = {
            id: Date.now(),
            timestamp: new Date().toLocaleString('zh-TW'),
            workflowType: workflowType, 
            location: location.join('、'),
            responsiblePerson: responsiblePerson,
            auditFocus: auditFocus.join('、'),
            images: imagePreviews,
            result: parsedResult
          };
          setRecords(prev => [newRecord, ...prev]);
          setIsAnalyzing(false);
          
          setTimeout(() => {
            if (resultRef.current) resultRef.current.scrollIntoView({ behavior: 'smooth' });
          }, 300);
          
          return; 
        } else {
          throw new Error("AI 回傳格式異常");
        }
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          setErrorMsg("系統分析失敗，已達最大重試次數，請稍後再試。");
          setIsAnalyzing(false);
          return;
        }
        await delay(retryDelays[attempt - 1]);
      }
    }
  };

  const clearForm = () => {
    setImagePreviews([]);
    setImagesBase64([]);
    setLocation([]);
    setResponsiblePerson("");
    setSiteNotes("");
    setAuditFocus(["綜合稽核"]);
    setWorkflowType("日常隱患排查"); 
    setAnalysisResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderRiskBadge = (level) => {
    if (level === '無') return null;
    switch(level) {
      case '高風險': return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">高風險</span>;
      case '中風險': return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">中風險</span>;
      case '低風險': return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">低風險</span>;
      default: return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">{level || '未評級'}</span>;
    }
  };

  const categoryColors = ['#2563eb', '#059669', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#e11d48', '#65a30d'];
  const getCategoryColor = (_, i) => categoryColors[i % categoryColors.length];
  const getRiskColor = (risk) => {
    if (risk === '高風險') return '#dc2626'; 
    if (risk === '中風險') return '#f97316'; 
    if (risk === '低風險') return '#eab308'; 
    return '#64748b'; 
  };

  const createDonutChart = (stats, title, getColorFunc, totalCount) => {
    if (totalCount === 0 || Object.keys(stats).length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-300 flex-1 bg-white min-h-[160px]">
          <span className="text-slate-400 font-bold text-sm">目前無資料</span>
        </div>
      );
    }

    const radius = 15.91549431; 
    let cumulativePercent = 0;
    const legendItems = [];

    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);

    const svgPaths = sortedStats.map(([label, count], index) => {
      const percent = (count / totalCount) * 100;
      const color = getColorFunc(label, index);
      const dashArray = `${percent} ${100 - percent}`;
      const dashOffset = 100 - cumulativePercent + 25; 
      
      cumulativePercent += percent;
      legendItems.push({ label, count, percent, color });

      return (
        <circle
          key={label}
          cx="21"
          cy="21"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
        />
      );
    });

    return (
      <div className="flex flex-col items-center gap-4 p-4 rounded-lg border border-slate-300 flex-1 bg-white">
        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 w-full text-center">{title}</h4>
        <div className="flex flex-row items-center w-full gap-4">
          <div className="relative w-20 h-20 flex-shrink-0 mx-auto">
            <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
              <circle cx="21" cy="21" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth="8" />
              {svgPaths}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-bold text-slate-800">{totalCount}</span>
            </div>
          </div>

          <div className="flex-1 w-full flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
            {legendItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <div className="flex items-center overflow-hidden">
                  <div className="w-2.5 h-2.5 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                  <span className="font-medium text-slate-800 truncate max-w-[80px]" title={item.label}>{item.label}</span>
                </div>
                <div className="whitespace-nowrap ml-1">
                  <span className="font-bold text-slate-800">{item.count}</span>
                  <span className="text-[10px] text-slate-500 ml-0.5">({item.percent.toFixed(0)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const createBarChart = (stats, title, getColorFunc, totalCount) => {
    if (totalCount === 0 || Object.keys(stats).length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-300 flex-1 bg-white min-h-[200px]">
          <span className="text-slate-400 font-bold text-sm">目前無資料</span>
        </div>
      );
    }

    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const maxCount = Math.max(...sortedStats.map(s => s[1]));

    return (
      <div className="flex flex-col gap-2 p-4 rounded-lg border border-slate-300 flex-1 bg-white min-h-[220px]">
        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2 w-full text-center">{title}</h4>
        <div className="flex flex-row items-end justify-around w-full h-32 mt-2 gap-1 sm:gap-2">
          {sortedStats.map(([label, count], index) => {
            const heightPercent = (count / maxCount) * 100;
            const color = getColorFunc(label, index);

            return (
              <div key={label} className="flex flex-col items-center justify-end flex-1 group relative h-full">
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none whitespace-nowrap transition-opacity z-10 shadow">
                  {count} 項 ({(count / totalCount * 100).toFixed(0)}%)
                </div>
                <span className="text-[10px] font-bold text-slate-600 mb-1">{count}</span>
                <div className="w-full px-1 sm:px-3 flex flex-col justify-end h-full">
                  <div 
                    className="w-full rounded-t-sm transition-all duration-500 ease-out min-h-[4px]" 
                    style={{ height: `${heightPercent}%`, backgroundColor: color }}
                  ></div>
                </div>
                <span className="text-[10px] font-medium text-slate-700 mt-2 truncate w-full text-center" title={label}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 font-sans flex flex-col">
      
      <header className="bg-slate-900 text-white shadow-md flex-shrink-0 z-10 sticky top-0">
        <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-xl font-bold tracking-wider">現場安全管理與隱患排查系統</h1>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={() => setActiveTab('audit')} 
              className={`px-5 py-2.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              現場稽核作業
            </button>
            <button 
              onClick={() => setActiveTab('history')} 
              className={`px-5 py-2.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              流轉追蹤管理
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full p-6">
        
        {activeTab === 'audit' && (
          <div className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row gap-6">
            
            <div className="w-full lg:w-1/3 flex-shrink-0 flex flex-col space-y-6">

              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-300">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center border-b border-slate-200 pb-3">
                  立項與紀錄新增
                </h2>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">安全管理流程</label>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {workflowOptions.map(wf => (
                        <button
                          key={wf}
                          type="button"
                          onClick={() => setWorkflowType(wf)}
                          className={`w-full py-2 px-1 rounded text-xs xl:text-sm font-bold border transition-colors ${
                            workflowType === wf
                              ? 'bg-blue-800 text-white border-blue-800'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {wf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <label className="block text-sm font-bold text-slate-700 mb-2">地點區域 (可複選)</label>
                    <div className="flex flex-wrap gap-2">
                      {locationOptions.map(loc => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => toggleLocation(loc)}
                          className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                            location.includes(loc)
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">區域負責人</label>
                    <input type="text" value={responsiblePerson} onChange={(e) => setResponsiblePerson(e.target.value)} placeholder="例如：王小明 課長" className="w-full p-3 border border-slate-300 rounded focus:ring-1 focus:ring-slate-500 focus:outline-none" />
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <label className="block text-sm font-bold text-slate-700 mb-2">重點稽核焦點 (可複選)</label>
                    <div className="flex flex-wrap gap-2">
                      {focusOptions.map(focus => (
                        <button
                          key={focus}
                          type="button"
                          onClick={() => toggleAuditFocus(focus)}
                          className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                            auditFocus.includes(focus)
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {focus}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">現場照片拍攝與上傳</label>
                    <div className="mt-1 flex flex-col items-center px-4 py-6 border-2 border-slate-300 border-dashed rounded bg-slate-50 hover:bg-slate-100 transition-colors">
                      {imagePreviews.length > 0 && (
                        <div className="w-full grid grid-cols-3 gap-2 mb-4">
                          {imagePreviews.map((preview, idx) => (
                            <div key={idx} className="relative group">
                              <img src={preview} alt={`預覽 ${idx + 1}`} className="w-full h-20 object-cover border border-slate-300 shadow-sm" />
                              <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-600 text-white rounded-sm text-[10px] px-1 shadow">
                                刪除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-center w-full">
                        <label className="relative cursor-pointer bg-white border border-slate-400 text-slate-700 w-full rounded font-bold py-2 flex items-center justify-center shadow-sm hover:bg-slate-100 transition-colors">
                          <span>{imagePreviews.length > 0 ? '+ 新增更多照片' : '選擇照片或拍照'}</span>
                          <input ref={fileInputRef} type="file" className="sr-only" accept="image/*" multiple onChange={handleImageChange} capture="environment" />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                      <span>現場狀況備註 (異音等)</span>
                    </label>
                    <textarea 
                      value={siteNotes}
                      onChange={(e) => setSiteNotes(e.target.value)}
                      placeholder="描述照片拍不到的現場狀況..."
                      rows="3"
                      className="w-full p-3 border border-slate-300 rounded focus:ring-1 focus:ring-slate-500 focus:outline-none"
                    ></textarea>
                  </div>

                  {errorMsg && (
                    <div className="text-red-700 text-sm font-bold bg-red-50 p-3 rounded border border-red-200">{errorMsg}</div>
                  )}

                  <div className="pt-2 flex flex-col gap-3">
                    <button onClick={analyzeImage} disabled={isAnalyzing || imagesBase64.length === 0} className={`w-full flex justify-center py-3 px-4 rounded shadow-sm text-base font-bold text-white transition-colors ${isAnalyzing || imagesBase64.length === 0 ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'}`}>
                      {isAnalyzing ? 'AI 智能比對中...' : '開始 AI 識別比對'}
                    </button>
                    <button onClick={clearForm} disabled={isAnalyzing || isGeneratingPDF} className="w-full py-2.5 border border-slate-300 rounded font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                      清除並重新填寫
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-2/3 flex flex-col">
              {analysisResult ? (
                <div className="space-y-4">
                  <div ref={resultRef} className="bg-white px-8 py-10 shadow-sm border border-slate-300 max-w-full font-serif text-slate-900">
                    
                    <div className="text-center mb-6 break-inside-avoid">
                      <h2 className="text-3xl font-bold tracking-widest border-b-2 border-slate-900 pb-4 mb-4">現場安全隱患識別報告</h2>
                    </div>

                    <table className="w-full border-collapse border border-slate-400 text-sm mb-6 break-inside-avoid">
                      <tbody>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 p-2 font-bold w-1/6 text-center">管理流程</td>
                          <td className="border border-slate-400 p-2 w-2/6 font-bold text-blue-900">{workflowType}</td>
                          <td className="border border-slate-400 bg-slate-100 p-2 font-bold w-1/6 text-center">稽核時間</td>
                          <td className="border border-slate-400 p-2 w-2/6">{new Date().toLocaleString('zh-TW')}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 p-2 font-bold text-center">稽核地點</td>
                          <td className="border border-slate-400 p-2">{location.join('、')}</td>
                          <td className="border border-slate-400 bg-slate-100 p-2 font-bold text-center">稽核焦點</td>
                          <td className="border border-slate-400 p-2">{auditFocus.join('、')}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 p-2 font-bold text-center">區域負責人</td>
                          <td className="border border-slate-400 p-2" colSpan="3">{responsiblePerson}</td>
                        </tr>
                      </tbody>
                    </table>

                    {(() => {
                      const categoryStats = {};
                      const riskStats = {};
                      let totalIssues = 0;

                      analysisResult.reports?.forEach(report => {
                        report.issues?.forEach(issue => {
                          const isNoIssue = !issue.description || issue.description.trim() === '無' || issue.description.trim() === '無明顯缺失';
                          if (isNoIssue) return; 

                          const cat = issue.category || '未分類';
                          const risk = issue.riskLevel || '未評級';
                          categoryStats[cat] = (categoryStats[cat] || 0) + 1;
                          riskStats[risk] = (riskStats[risk] || 0) + 1;
                          totalIssues++;
                        });
                      });

                      if (totalIssues === 0) return null;

                      return (
                        <div className="mb-6 break-inside-avoid html2pdf__page-break-avoid">
                          <h3 className="text-sm font-bold text-slate-800 mb-2 bg-slate-200 p-2 border border-slate-400">【稽核分析統計】</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {createDonutChart(categoryStats, "缺失類別分佈", getCategoryColor, totalIssues)}
                            {createDonutChart(riskStats, "風險等級分佈", getRiskColor, totalIssues)}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mb-8 break-inside-avoid html2pdf__page-break-avoid">
                      <h3 className="text-sm font-bold text-slate-800 mb-2 bg-slate-200 p-2 border border-slate-400">【綜合總結】</h3>
                      <p className="text-slate-800 text-sm leading-relaxed p-4 border border-slate-400 bg-white">{analysisResult.overallSummary}</p>
                    </div>

                    <div className="space-y-6">
                      {analysisResult.reports?.map((report, rIdx) => (
                        <div key={rIdx} className="border-t-2 border-slate-800 pt-4 mb-8">
                          
                          <div className="mb-3 flex justify-start items-center gap-3 break-inside-avoid html2pdf__page-break-avoid">
                            <h3 className="font-bold text-base bg-slate-800 text-white px-3 py-1 inline-block m-0">照片 {report.photoIndex}</h3>
                            <span className="text-sm font-bold text-slate-700">{report.assessment}</span>
                          </div>
                          
                          <div className="flex flex-col md:flex-row gap-4 items-start">
                            
                            <div className="w-full md:w-5/12 flex-shrink-0 break-inside-avoid html2pdf__page-break-avoid border border-slate-300 p-2 bg-slate-50">
                              {imagePreviews[report.photoIndex - 1] ? (
                                <img 
                                  src={imagePreviews[report.photoIndex - 1]} 
                                  alt={`照片 ${report.photoIndex}`} 
                                  className="w-full object-contain max-h-[140mm]"
                                  crossOrigin="anonymous"
                                />
                              ) : (
                                 <div className="h-40 flex items-center justify-center text-slate-400 text-sm">無照片</div>
                              )}
                            </div>

                            <div className="w-full md:w-7/12 flex flex-col space-y-3">
                              {report.issues && report.issues.length > 0 ? (
                                report.issues.map((issue, idx) => {
                                  const isNoIssue = !issue.description || issue.description.trim() === '無' || issue.description.trim() === '無明顯缺失';
                                  
                                  if (isNoIssue) {
                                    return (
                                      <div key={idx} className="bg-slate-50 p-4 rounded border border-slate-300 shadow-sm text-sm relative break-inside-avoid html2pdf__page-break-avoid" style={{ pageBreakInside: 'avoid' }}>
                                        <div className="flex items-center gap-2">
                                          <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300">
                                            {issue.category}
                                          </span>
                                          <span className="text-slate-400 font-bold ml-2">無明顯缺失</span>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={idx} className="border border-slate-400 p-4 text-sm relative break-inside-avoid html2pdf__page-break-avoid bg-white">
                                      <div className="flex justify-between items-start border-b border-slate-200 pb-2 mb-2">
                                        <div className="flex items-center gap-2">
                                          {renderRiskBadge(issue.riskLevel)}
                                          <span className="font-bold text-slate-800">[{issue.category}]</span>
                                        </div>
                                      </div>
                                      
                                      <div className="mb-3">
                                        <span className="font-bold text-slate-900 block mb-1">【缺失描述】：</span>
                                        <div className="text-slate-800 whitespace-pre-wrap pl-4">{issue.description}</div>
                                      </div>
                                      
                                      <div className="mb-3 bg-slate-50 p-2 border border-slate-200">
                                        <span className="font-bold text-slate-700">依據法規/標準：</span> {issue.standardReference}
                                      </div>
                                      
                                      <div className="mb-2">
                                        <span className="font-bold text-blue-900 block mb-1">【改善對策】：</span>
                                        <div className="text-slate-800 whitespace-pre-wrap pl-4">{issue.recommendation}</div>
                                      </div>
                                      
                                      <div className="mt-4 pt-3 border-t border-dashed border-slate-300 grid grid-cols-2 gap-4 html2pdf__page-break-avoid" data-html2canvas-ignore="true">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1">預計完成日</label>
                                            <input 
                                              type="date" 
                                              value={issue.dueDate || ''}
                                              onChange={(e) => updateIssueStatus(records[0]?.id, report.photoIndex, idx, 'dueDate', e.target.value)}
                                              className="w-full text-xs p-1.5 rounded border border-slate-300 focus:ring-1 focus:ring-slate-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1">流程節點狀態</label>
                                            <select 
                                              value={issue.status || '已上報'}
                                              onChange={(e) => updateIssueStatus(records[0]?.id, report.photoIndex, idx, 'status', e.target.value)}
                                              className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white font-bold focus:ring-1 focus:ring-slate-500"
                                            >
                                              <option value="已上報">已上報</option>
                                              <option value="已派發">已派發</option>
                                              <option value="整改中">整改中</option>
                                              <option value="已銷項">已銷項</option>
                                            </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-sm text-slate-500 italic border border-slate-300 p-4 html2pdf__page-break-avoid">未發現明顯缺失</p>
                              )}
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={generatePDF} disabled={isGeneratingPDF} className={`w-full lg:w-auto self-end px-8 py-3 rounded shadow text-base font-bold text-white transition-colors mt-2 ${isGeneratingPDF ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-900'}`}>
                    {isGeneratingPDF ? 'PDF 報告產生中...' : '稽核報告下載'}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-slate-300 flex flex-col items-center justify-center h-full min-h-[500px] text-slate-400">
                   <p className="text-lg font-bold text-slate-500">等待分析結果</p>
                   <p className="text-sm mt-2">請於左側上傳現場照片並點擊識別</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-screen-2xl mx-auto space-y-6">
            
            {(() => {
              if (records.length === 0) return null;

              const historyCategoryStats = {};
              const historyRiskStats = {};
              const historyLocationStats = {};
              let historyTotalIssues = 0;

              records.forEach(record => {
                record.result?.reports?.forEach(report => {
                  report.issues?.forEach(issue => {
                    const isNoIssue = !issue.description || issue.description.trim() === '無' || issue.description.trim() === '無明顯缺失';
                    if (isNoIssue) return;

                    historyTotalIssues++;

                    const cat = issue.category || '未分類';
                    historyCategoryStats[cat] = (historyCategoryStats[cat] || 0) + 1;

                    const risk = issue.riskLevel || '未評級';
                    historyRiskStats[risk] = (historyRiskStats[risk] || 0) + 1;

                    const loc = record.location || '未標示';
                    historyLocationStats[loc] = (historyLocationStats[loc] || 0) + 1;
                  });
                });
              });

              return (
                <div className="mb-6 bg-slate-100 p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-l-4 border-blue-700 pl-3">當月缺失總體統計 ({new Date().getMonth() + 1}月)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {createBarChart(historyCategoryStats, "各缺失類別統計", getCategoryColor, historyTotalIssues)}
                    {createBarChart(historyRiskStats, "風險等級分佈", getRiskColor, historyTotalIssues)}
                    {createBarChart(historyLocationStats, "各單位缺失數", getCategoryColor, historyTotalIssues)}
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between border-b border-slate-300 pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center">
                <span>流轉追蹤管理清單</span>
                <span className="ml-3 text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded border border-slate-300">共 {records.length} 筆專案紀錄</span>
              </h2>
              {records.length > 0 && (
                <button 
                  onClick={exportToCSV}
                  className="bg-green-700 text-white text-sm font-bold px-4 py-2 rounded shadow-sm hover:bg-green-800 transition-colors"
                >
                  匯出 Excel/CSV 流轉報表
                </button>
              )}
            </div>

            {records.length === 0 ? (
              <div className="text-center py-24 bg-white rounded border border-slate-300">
                <p className="text-base text-slate-500 font-bold">目前尚無流轉紀錄</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {records.map((record) => {
                  let totalIssues = 0;
                  let closedIssues = 0;
                  record.result.reports?.forEach(r => {
                    if (r.issues) {
                      const validIssues = r.issues.filter(i => {
                        const isNoIssue = !i.description || i.description.trim() === '無' || i.description.trim() === '無明顯缺失';
                        return !isNoIssue;
                      });
                      totalIssues += validIssues.length;
                      closedIssues += validIssues.filter(i => i.status === '已銷項').length;
                    }
                  });
                  const progress = totalIssues === 0 ? 100 : Math.round((closedIssues / totalIssues) * 100);

                  return (
                    <div key={record.id} className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm hover:shadow transition-shadow flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4 border-b border-slate-200 pb-3">
                        <div>
                          <p className="text-xs font-bold text-blue-800 mb-1">{record.workflowType}</p>
                          <p className="font-bold text-slate-900 text-base mb-1">{record.location}</p>
                          <p className="text-xs text-slate-600">{record.responsiblePerson} <span className="mx-1 text-slate-300">|</span> <span className="text-slate-800 font-bold">{Array.isArray(record.auditFocus) ? record.auditFocus.join('、') : record.auditFocus}</span></p>
                        </div>
                        <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 border border-slate-200">{record.timestamp.split(' ')[0]}</span>
                      </div>
                      
                      {record.images && record.images.length > 0 && (
                        <div className="relative mb-4 h-32 border border-slate-300 bg-slate-50 p-1 rounded">
                          <img src={record.images[0]} alt="稽核照片" className="w-full h-full object-cover rounded-sm" />
                          {record.images.length > 1 && (
                            <div className="absolute bottom-2 right-2 bg-slate-900 text-white text-[10px] px-2 py-1 font-bold rounded">
                              +{record.images.length - 1}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mb-5 flex-1">
                        <div className="flex justify-between text-xs mb-2">
                          <span className="font-bold text-slate-700">銷項進度</span>
                          <span className="font-bold text-slate-900">{closedIssues} / {totalIssues} ({progress}%)</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 border border-slate-300 rounded-full overflow-hidden">
                          <div className={`h-full ${progress === 100 ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>

                      <details className="text-sm border border-slate-300 rounded-lg group mt-auto bg-slate-50 overflow-hidden">
                        <summary className="p-3 font-bold text-slate-800 cursor-pointer list-none flex justify-between items-center group-open:border-b group-open:border-slate-300 hover:bg-slate-100 transition-colors">
                          <span>展開細項與流轉歷程</span>
                          <span className="text-[10px] bg-red-100 text-red-800 px-2 py-1 rounded border border-red-200">未銷項：{totalIssues - closedIssues}</span>
                        </summary>
                        <div className="p-4 space-y-4 max-h-80 overflow-y-auto bg-white">
                          {record.result.reports?.map((r) => 
                            r.issues?.map((issue, idx) => {
                              const isNoIssue = !issue.description || issue.description.trim() === '無' || issue.description.trim() === '無明顯缺失';
                              if (isNoIssue) return null; 

                              return (
                                <div key={`${r.photoIndex}-${idx}`} className="p-3 border border-slate-300 rounded text-xs bg-white shadow-sm">
                                  <div className="font-bold text-slate-800 mb-2">{issue.description}</div>
                                  
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-3 pt-3 border-t border-slate-200 gap-2">
                                    <div className="w-full sm:w-auto flex items-center gap-2">
                                      <span className="text-slate-500 font-bold whitespace-nowrap">預計完成</span>
                                      <input 
                                        type="date" 
                                        value={issue.dueDate || ''}
                                        onChange={(e) => updateIssueStatus(record.id, r.photoIndex, idx, 'dueDate', e.target.value)}
                                        className="p-1.5 border border-slate-300 rounded flex-1"
                                      />
                                    </div>
                                    <select 
                                      value={issue.status || '已上報'}
                                      onChange={(e) => updateIssueStatus(record.id, r.photoIndex, idx, 'status', e.target.value)}
                                      className={`p-1.5 border font-bold rounded w-full sm:w-auto ${
                                        issue.status === '已銷項' ? 'bg-green-100 text-green-800 border-green-300' : 
                                        issue.status === '整改中' ? 'bg-orange-100 text-orange-800 border-orange-300' : 
                                        issue.status === '已派發' ? 'bg-blue-100 text-blue-800 border-blue-300' : 
                                        'bg-red-50 text-red-800 border-red-300'
                                      }`}
                                    >
                                      <option value="已上報">已上報</option>
                                      <option value="已派發">已派發</option>
                                      <option value="整改中">整改中</option>
                                      <option value="已銷項">已銷項</option>
                                    </select>
                                  </div>

                                  {issue.logs && issue.logs.length > 0 && (
                                    <div className="mt-4 bg-slate-50 p-2 rounded border border-slate-200">
                                      <p className="text-[10px] font-bold text-slate-500 mb-1">【流轉歷程留痕】：</p>
                                      <div className="space-y-1.5 border-l-2 border-slate-300 pl-2 ml-1">
                                        {issue.logs.map((log, logIdx) => (
                                          <div key={logIdx} className="text-[11px] text-slate-700">
                                            <span className="text-slate-400 mr-2">[{log.time}]</span>
                                            {log.action}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
