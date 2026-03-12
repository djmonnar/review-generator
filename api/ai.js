export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }

    const body = req.body;
    const action = body.action;
    
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    let payload = {};

    try {
        // ==========================================
        // 1. 배민 리뷰 / 인스타 원고 텍스트 생성 로직
        // ==========================================
        if (action === 'polish' || action === 'generate' || action === 'insta') {
            let systemPrompt = "";
            let userPrompt = "";
            let isJson = false;
            let jsonSchema = {};

            if (action === 'polish') {
                systemPrompt = "당신은 배달 식당 사장님을 돕는 센스있는 마케터입니다. 사장님이 대충 적은 메모를 리뷰 답글용 문장으로 예쁘게 다듬어주세요.";
                userPrompt = `사장님 메모: "${body.text}"\n이것을 예쁘게 변환해주세요.`;
            } 
            else if (action === 'generate') {
                systemPrompt = `당신은 배달 앱 리뷰 답글을 전문적으로 작성하는 식당 사장님이자 리뷰 분석가입니다. [작성 원칙]을 준수하세요.`;
                userPrompt = `[분위기]: ${body.tone}\n[별점]: ${body.rating}점\n[고객 리뷰]:\n${body.reviewText}\n[추가 멘트]: ${body.extraInfo || ''}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        reply: { type: "STRING" }, customerType: { type: "STRING" }, sentiment: { type: "STRING" }, keywords: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            } 
            else if (action === 'insta') {
                systemPrompt = `당신은 수만 명의 팔로워를 보유한 지역 핫플 전문 인스타그램 마케터입니다. [작성 원칙]에 맞춰 모바일 화면에서 읽기 좋고 사람들의 발길을 이끄는 완벽한 원고와 지역 기반 해시태그를 기획해 주세요.`;
                userPrompt = `[업종]: ${body.businessType}\n[지역명]: ${body.locationName}\n[홍보 내용]:\n${body.promoContent}\n[글 분위기]: ${body.tone}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        caption: { type: "STRING" }, hashtags: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            }

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            };

            if (isJson) {
                payload.generationConfig = { responseMimeType: "application/json", responseSchema: jsonSchema };
            }

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || '구글 API 에러');

            const resultText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ result: isJson ? JSON.parse(resultText) : resultText });
        }
        
        // ==========================================
        // 2. [NEW] 현수막 시안(이미지) 생성 로직
        // ==========================================
        else if (action === 'banner') {
            // ⭐ 구글 최고성능 이미지 생성 모델 (Imagen 4.0) 로 URL 변경
            url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
            
            const imagePrompt = `당신은 현수막 디자인 업계의 최고 수준의 시각 디자이너입니다. 다음 요청사항에 맞춰 고품질의 상업용 현수막(배너) 시안 이미지를 생성해 주세요.
- 현수막 문구: "${body.bannerText}" (반드시 이미지 안에 이 문구가 타이포그래피 형태로 또렷하게 들어가야 합니다.)
- 디자인 사이즈/비율: ${body.bannerSize}
- 디자인 분위기: ${body.bannerVibe}
- 전체 색상 톤: ${body.bannerTone}
배경은 너무 복잡하지 않게 문구가 돋보이도록 처리하고, 세련된 레이아웃을 구성해 주세요.`;

            // ⭐ Imagen 4.0 모델 규격에 맞게 데이터 구조 변경
            payload = {
                instances: [
                    { prompt: imagePrompt }
                ],
                parameters: {
                    sampleCount: 1
                }
            };

            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            
            if (!response.ok) {
                console.error("이미지 API 에러 상세:", data);
                throw new Error(data.error?.message || '이미지 생성 API 에러');
            }

            // ⭐ Imagen 4.0 규격에 맞춰 Base64 이미지 데이터 추출
            const base64Image = data.predictions?.[0]?.bytesBase64Encoded;
            
            if (!base64Image) {
                throw new Error("이미지 생성에 실패했습니다. 프롬프트를 조금 수정해 보세요.");
            }

            return res.status(200).json({ result: { image: base64Image } });
        } 
        else {
            return res.status(400).json({ error: '알 수 없는 요청입니다.' });
        }
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message || '서버 내부 오류' });
    }
}
