export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    }

    // Vercel 환경변수에서 키 가져오기
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다. (Vercel 설정 확인 필요)' });
    }

    const { action, text, rating, tone, reviewText, extraInfo } = req.body;
    let systemPrompt = "";
    let userPrompt = "";
    let isJson = false;

    if (action === 'polish') {
        systemPrompt = "당신은 배달 식당 사장님을 돕는 센스있는 마케터입니다. 사장님이 대충 적은 메모를, 배달앱 리뷰 답글에 자연스럽게 이어질 수 있는 친절하고 다정한 1~2문장의 안내 멘트로 예쁘게 다듬어주세요. 이모지도 1~2개 섞어주세요.";
        userPrompt = `사장님 메모: "${text}"\n이것을 고객에게 전하는 리뷰 답글용 문장으로 예쁘게 변환해주세요.`;
    } 
    else if (action === 'generate') {
        systemPrompt = `당신은 배달 앱 리뷰 답글을 전문적으로 작성하는 식당 사장님이자, 리뷰 분석가입니다. 
[작성 원칙]
1. 고객 분석: 제공된 리뷰 원문에서 '고객 닉네임'과 '주문 횟수'를 파악하여 첫인사에 자연스럽게 활용하세요.
2. 말투 적용: 사용자가 선택한 [답변 분위기]를 완벽하게 반영하세요.
3. 대응: 별점이 1~3점일 경우 사과와 개선 약속, 4~5점은 폭풍 공감과 감사를 전하세요.
4. 금지사항: AI가 쓴 것 같은 기계적인 연결어 금지. 자연스럽게 작성.`;
        userPrompt = `[요청된 답변 분위기]: ${tone}\n[고객 별점]: ${rating}점\n[고객 리뷰 원문]:\n${reviewText}\n${extraInfo ? `\n[사장님 추가 강조사항]: ${extraInfo}` : ''}`;
        isJson = true;
    } else {
        return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    // 💡 중요: 실제 범용 모델인 gemini-2.5-flash 로 수정됨!
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    let payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    if (isJson) {
        payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    reply: { type: "STRING" },
                    customerType: { type: "STRING" },
                    sentiment: { type: "STRING" },
                    keywords: { type: "ARRAY", items: { type: "STRING" } }
                }
            }
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || '구글 API 서버 에러');
        }

        const resultText = data.candidates[0].content.parts[0].text;
        
        if (isJson) {
            res.status(200).json({ result: JSON.parse(resultText) });
        } else {
            res.status(200).json({ result: resultText });
        }

    } catch (error) {
        console.error('API 통신 에러:', error);
        res.status(500).json({ error: error.message || 'AI 서버와 통신 중 문제가 발생했습니다.' });
    }
}
