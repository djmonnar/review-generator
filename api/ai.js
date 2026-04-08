module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Vercel 서버에 구글 API 키가 없습니다!' });

    const body = req.body || {};
    const action = body.action;

    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    let payload = {};

    try {
        // [1] 배민 리뷰 / 인스타
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
                systemPrompt = `당신은 배달 앱 리뷰 답글을 전문적으로 작성하는 식당 사장님이자 리뷰 분석가입니다. 아래 [작성 원칙]을 준수하세요.

[작성 원칙]
1. 고객의 리뷰 내용과 별점을 꼼꼼히 반영하여 진정성 있는 답글을 작성하세요.
2. 사용자가 선택한 [분위기]에 맞춰 말투와 어조를 조절하세요.
3. [추가 멘트]가 제공되었다면 답글 내용에 자연스럽게 녹여내세요.
4. 모바일 배달 앱에서 고객이 읽기 편하도록 적절한 줄바꿈(엔터)을 사용해 문단을 나누세요. 절대 한 문단으로 뭉뚱그려 쓰지 마세요.
5. 부정적인 리뷰(낮은 별점)일 경우 감정적인 대응을 자제하고, 공감과 개선의 의지를 먼저 보여주세요.
6. 글은 7줄이상 넘기지 말것
7. 과도한 오버 하지 말것
8. 고객의 개인정보를 요구하거나 쓸데없는 질문은 금지`; // <--- 백틱(`)으로 정상적으로 수정됨

                userPrompt = `[분위기]: ${body.tone}\n[별점]: ${body.rating}점\n[고객 리뷰]:\n${body.reviewText}\n[추가 멘트]: ${body.extraInfo || ''}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        reply: { type: "STRING" },
                        customerType: { type: "STRING" },
                        sentiment: { type: "STRING" },
                        keywords: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            }
            else if (action === 'insta') {
                systemPrompt = `당신은 수만 명의 팔로워를 보유한 지역 핫플 전문 인스타그램 마케터입니다. 아래의 [작성 원칙]에 맞춰 모바일 화면에서 읽기 좋고 사람들의 발길을 이끄는 완벽한 원고와 지역 기반 해시태그를 기획해 주세요.

[작성 원칙]
1. 가독성을 위해 문맥이 바뀔 때마다 반드시 줄바꿈(엔터)을 넉넉히 넣어 문단을 분리하세요. 절대 통짜 글로 작성하지 마세요.
2. 텍스트 중간중간 글 분위기에 맞는 이모지를 적절히 섞어주세요.
3. 해시태그(hashtags)를 생성할 때는 배열의 모든 단어 앞에 반드시 무조건 '#' 기호를 붙이세요. (예: ["#맛집", "#가볼만한곳"])`;
                
                userPrompt = `[업종]: ${body.businessType}\n[지역명]: ${body.locationName}\n[홍보 내용]:\n${body.promoContent}\n[글 분위기]: ${body.tone}`;
                isJson = true;
                jsonSchema = {
                    type: "OBJECT",
                    properties: {
                        caption: { type: "STRING" },
                        hashtags: { type: "ARRAY", items: { type: "STRING" } }
                    }
                };
            }

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            };

            if (isJson) {
                payload.generationConfig = {
                    responseMimeType: "application/json",
                    responseSchema: jsonSchema
                };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (!response.ok) throw new Error(`구글 API 오류: ${data.error?.message}`);

            const candidate = data.candidates?.[0];
            if (!candidate?.content) throw new Error("AI 응답이 차단되었습니다.");

            let resultText = candidate.content.parts?.[0]?.text;
            if (!resultText) throw new Error("AI 응답이 비어있습니다.");

            if (isJson) {
                resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
                return res.status(200).json({ result: JSON.parse(resultText) });
            } else {
                return res.status(200).json({ result: resultText });
            }
        }

        // [2] 현수막 Step 1: 기획하기
        else if (action === 'banner') {
            let systemPrompt = `당신은 최고 수준의 현수막 시각 디자이너입니다. 우리는 '배경 이미지'와 '텍스트'를 따로 생성하여 합성합니다.

[작성 원칙]
1. bgPrompt: 배경 이미지 생성 프롬프트. ⭐반드시 100% 영어로만 작성!⭐ 짧은 키워드 10개 이내. 반드시 "no text, empty background, blank space" 포함.
2. bgTheme: 행사 내용과 톤에 맞춰 예비 배경 테마 5개 중 1개 필수 선택 ("gold", "party", "pastel", "dark", "clean")
3. textColor: 배경과 대비되어 글씨가 잘 보일 Hex 색상 코드
4. fontType: "Gowun Dodum", "Noto Sans KR", "Jua", "Nanum Pen Script" 중 택 1
5. textShadow: 글씨 가독성을 높일 CSS 그림자 값
6. textAlign: "left", "center", "right" 중 택 1
7. fontWeight: "400", "700", "900" 중 택 1`;

            let userPrompt = `[행사 카테고리]: ${body.eventType}\n[현수막 문구]: ${body.bannerText}\n[분위기]: ${body.bannerVibe}\n[색상 톤]: ${body.bannerTone}`;
            let jsonSchema = {
                type: "OBJECT",
                properties: {
                    bgPrompt: { type: "STRING" },
                    bgTheme: { type: "STRING" },
                    textColor: { type: "STRING" },
                    fontType: { type: "STRING" },
                    textShadow: { type: "STRING" },
                    textAlign: { type: "STRING" },
                    fontWeight: { type: "STRING" }
                }
            };

            payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: jsonSchema
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (!response.ok) throw new Error(`구글 AI 오류: ${data.error?.message}`);

            let resultText = data.candidates[0].content.parts[0].text
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();
            return res.status(200).json({ result: JSON.parse(resultText) });
        }
        else {
            return res.status(400).json({ error: '알 수 없는 요청입니다.' });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
    }
}
