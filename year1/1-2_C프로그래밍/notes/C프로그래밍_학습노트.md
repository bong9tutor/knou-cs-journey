# C프로그래밍 학습 노트

> 방송대 컴퓨터과학과 1학년 2학기 "C프로그래밍" 종합 학습 노트.
> C언어의 기초 문법부터 포인터, 동적 메모리, 파일 입출력, 다중 파일 구성까지 실행 가능한 예제 중심으로 정리한다.
> KNOU 교재(김형근·곽덕훈·정재화, 2020, 9장 구성, ISBN 9788920035197) 기준 + 실습 보강.

이 노트는 강의 진도와 무관하게 혼자서도 처음부터 끝까지 따라갈 수 있도록 구성했다. 모든 코드는 표준 C(C99/C11) 기준으로 작성했고, GCC(`gcc`)나 Clang, Visual Studio 어디서든 컴파일된다. 코드 블록 아래에는 항상 "실행 결과" 또는 "동작 설명"을 붙였으니 직접 입력해 보고 결과를 맞춰 보는 방식으로 학습하자.

---

## 1. C언어와 컴파일 과정

C는 1972년 데니스 리치가 만든 절차적 언어다. 운영체제(UNIX/Linux), 임베디드, 게임 엔진 등 성능이 중요한 곳에서 지금도 쓰인다. 하드웨어에 가까워 메모리를 직접 다룰 수 있다는 점이 가장 큰 특징이자, 동시에 가장 어려운 부분(포인터)이다.

C 프로그램이 실행되기까지는 4단계를 거친다.

1. **전처리(Preprocessing)** - `#include`, `#define` 같은 `#`으로 시작하는 지시문을 처리해 순수한 C 소스로 펼친다.
2. **컴파일(Compilation)** - 전처리된 소스를 어셈블리/오브젝트 코드(`.o`, `.obj`)로 번역한다.
3. **링크(Linking)** - 오브젝트 파일들과 라이브러리(예: `printf`가 든 표준 라이브러리)를 묶어 실행 파일을 만든다.
4. **실행(Execution)** - 운영체제가 실행 파일을 메모리에 올려 `main`부터 동작시킨다.

가장 기본이 되는 첫 프로그램이다.

```c
#include <stdio.h>   // 표준 입출력 함수(printf 등)의 선언을 가져옴

int main(void)       // 프로그램의 시작점. 반환형 int
{
    printf("Hello, C!\n");   // 화면에 출력, \n은 줄바꿈
    return 0;                // 0 반환 = 정상 종료를 운영체제에 알림
}
```

실행 결과:

```
Hello, C!
```

GCC로 직접 컴파일하고 실행하는 명령은 다음과 같다.

```
gcc hello.c -o hello      # hello.c를 컴파일해 실행 파일 hello 생성
./hello                   # 실행 (Windows에서는 hello.exe)
```

`main` 함수는 모든 C 프로그램의 진입점이다. 중괄호 `{ }` 사이가 함수의 몸체이고, 각 문장은 세미콜론 `;`으로 끝난다. 이 두 가지를 빠뜨리는 것이 초보자의 가장 흔한 오류다.

---

## 2. 자료형과 변수

변수는 값을 저장하는 메모리 공간에 붙인 이름이다. C는 변수를 쓰기 전에 반드시 **자료형**과 함께 선언해야 한다(정적 타입 언어).

| 자료형 | 의미 | 크기(일반적) | 예시 값 |
| --- | --- | --- | --- |
| `char` | 문자 / 1바이트 정수 | 1바이트 | `'A'`, `65` |
| `int` | 정수 | 4바이트 | `-7`, `1000` |
| `long` | 큰 정수 | 4~8바이트 | `100000L` |
| `float` | 단정밀도 실수 | 4바이트 | `3.14f` |
| `double` | 배정밀도 실수 | 8바이트 | `3.141592` |

```c
#include <stdio.h>

int main(void)
{
    int age = 20;                 // 정수 변수 선언과 동시에 초기화
    double height = 175.5;        // 실수 변수
    char grade = 'A';             // 문자 변수 (작은따옴표)

    printf("나이: %d\n", age);
    printf("키: %.1f\n", height);
    printf("학점: %c\n", grade);
    printf("int 크기: %zu바이트\n", sizeof(int));  // sizeof는 바이트 크기
    return 0;
}
```

실행 결과:

```
나이: 20
키: 175.5
학점: A
int 크기: 4바이트
```

`sizeof` 연산자는 자료형이나 변수가 차지하는 바이트 수를 알려준다. 정수에 부호가 필요 없으면 `unsigned int`처럼 `unsigned`를 붙여 표현 범위를 양수 쪽으로 두 배 넓힐 수 있다. 상수에는 `const`를 붙여 변경을 막는다.

```c
const double PI = 3.141592;   // PI = 3.0; 같은 재대입 시 컴파일 오류
```

---

## 3. 표준 입출력 (printf / scanf)

화면 출력은 `printf`, 키보드 입력은 `scanf`로 한다. 둘 다 **서식 지정자**로 값의 종류를 알려준다.

| 지정자 | 대응 자료형 |
| --- | --- |
| `%d` | int (10진 정수) |
| `%f` | float/double (실수) |
| `%c` | char (문자) |
| `%s` | 문자열 |
| `%lf` | double 입력 |
| `%x` | 16진수 정수 |

```c
#include <stdio.h>

int main(void)
{
    int a, b;
    printf("두 정수를 입력하세요: ");
    scanf("%d %d", &a, &b);       // &는 변수의 주소. scanf는 주소가 필요!
    printf("합: %d\n", a + b);
    printf("곱: %d\n", a * b);
    return 0;
}
```

입력이 `7 5`일 때 실행 결과:

```
두 정수를 입력하세요: 7 5
합: 12
곱: 35
```

핵심 주의점: `scanf`에는 변수 앞에 반드시 `&`(주소 연산자)를 붙인다. `scanf("%d", a)`처럼 빼먹으면 프로그램이 비정상 종료할 수 있다(문자열 `%s`만은 예외인데, 이는 포인터 단원에서 이해하게 된다). 서식 너비를 조절하려면 `%5d`(5칸 오른쪽 정렬), `%.2f`(소수점 2자리)처럼 쓴다.

---

## 4. 연산자

C의 연산자는 산술, 관계, 논리, 대입, 비트 등으로 나뉜다.

```c
#include <stdio.h>

int main(void)
{
    int a = 7, b = 3;
    printf("a + b = %d\n", a + b);   // 10
    printf("a - b = %d\n", a - b);   // 4
    printf("a / b = %d\n", a / b);   // 2  (정수끼리 나눗셈은 몫)
    printf("a %% b = %d\n", a % b);  // 1  (나머지, %% 로 % 출력)

    printf("(a > b) = %d\n", a > b);     // 1 (참)
    printf("(a == b) = %d\n", a == b);   // 0 (거짓)
    printf("(a>0 && b>0) = %d\n", a > 0 && b > 0);  // 1

    a += 5;   // a = a + 5
    printf("a = %d\n", a);   // 12
    return 0;
}
```

실행 결과:

```
a + b = 10
a - b = 4
a / b = 2
a % b = 1
(a > b) = 1
(a == b) = 0
(a>0 && b>0) = 1
a = 12
```

기억할 점:

- 정수끼리 나누면 소수점이 버려진다. `7 / 2`는 `3`이다. 실수 결과가 필요하면 `7.0 / 2` 또는 형변환 `(double)7 / 2`를 쓴다.
- `=`(대입)와 `==`(비교)는 완전히 다르다. 조건문에서 `==`를 `=`로 잘못 쓰는 것은 치명적 버그다.
- 논리연산 `&&`, `||`는 **단축 평가**를 한다. `a && b`에서 `a`가 거짓이면 `b`는 평가하지 않는다.
- 증감 연산자 `++`, `--`는 전위(`++a`)와 후위(`a++`)의 평가 시점이 다르다.

```c
int a = 5;
printf("%d\n", a++);   // 5 출력 후 a는 6  (후위: 먼저 쓰고 증가)
printf("%d\n", ++a);   // a를 7로 만든 뒤 7 출력 (전위: 먼저 증가)
```

---

## 5. 형변환 (Type Casting)

서로 다른 자료형이 섞이면 작은 형이 큰 형으로 자동 변환(묵시적)된다. 필요하면 `(자료형)`으로 명시적 변환을 강제한다.

```c
#include <stdio.h>

int main(void)
{
    int total = 7, count = 2;
    double avg1 = total / count;            // 3.0 (정수 나눗셈 후 변환)
    double avg2 = (double)total / count;    // 3.5 (먼저 double로 변환)

    printf("avg1 = %.1f\n", avg1);
    printf("avg2 = %.1f\n", avg2);
    return 0;
}
```

실행 결과:

```
avg1 = 3.0
avg2 = 3.5
```

`avg1`이 3.5가 아닌 3.0인 이유는 `total / count`가 정수 연산으로 먼저 끝나 3이 되고, 그 뒤 double에 담겼기 때문이다. 평균 같은 계산에서 자주 나오는 함정이니 주의하자.

---

## 6. 제어문 (조건문)

### if / else if / else

```c
#include <stdio.h>

int main(void)
{
    int score;
    printf("점수: ");
    scanf("%d", &score);

    if (score >= 90)
        printf("A\n");
    else if (score >= 80)
        printf("B\n");
    else if (score >= 70)
        printf("C\n");
    else
        printf("F\n");
    return 0;
}
```

입력 `85`일 때 출력: `B`

조건이 여러 갈래일 때 `else if`로 잇는다. 위에서부터 차례로 검사하므로 범위가 큰 조건을 먼저 두면 안 된다.

### switch

정수나 문자 하나를 여러 값과 비교할 때 깔끔하다. 각 `case` 끝에 `break`를 빠뜨리면 다음 case로 흘러내려간다(fall-through).

```c
#include <stdio.h>

int main(void)
{
    char grade = 'B';
    switch (grade) {
        case 'A': printf("훌륭함\n"); break;
        case 'B': printf("좋음\n");   break;
        case 'C': printf("보통\n");   break;
        default:  printf("분발\n");
    }
    return 0;
}
```

출력: `좋음`

삼항 연산자 `조건 ? 참값 : 거짓값`은 간단한 분기를 한 줄로 줄인다.

```c
int a = 7, b = 3;
int max = (a > b) ? a : b;   // max = 7
```

---

## 7. 반복문

### for 문

반복 횟수가 정해졌을 때 쓴다. `for(초기식; 조건식; 증감식)` 순서로 동작한다.

```c
#include <stdio.h>

int main(void)
{
    int sum = 0;
    for (int i = 1; i <= 10; i++)   // i를 1부터 10까지
        sum += i;
    printf("1~10 합: %d\n", sum);   // 55
    return 0;
}
```

출력: `1~10 합: 55`

### while / do-while

조건이 참인 동안 반복한다. `do-while`은 몸체를 최소 한 번은 실행한 뒤 조건을 검사한다.

```c
#include <stdio.h>

int main(void)
{
    int n = 5, fact = 1;
    while (n > 0) {       // n이 0보다 큰 동안
        fact *= n;
        n--;
    }
    printf("5! = %d\n", fact);   // 120
    return 0;
}
```

출력: `5! = 120`

### break / continue 와 중첩 반복

`break`는 반복을 즉시 끝내고, `continue`는 이번 회차의 남은 부분을 건너뛰고 다음 회차로 간다. 구구단처럼 표를 만들 때는 반복을 중첩한다.

```c
#include <stdio.h>

int main(void)
{
    for (int i = 2; i <= 4; i++) {        // 바깥: 단
        for (int j = 1; j <= 3; j++)      // 안쪽: 곱하는 수
            printf("%d*%d=%-3d", i, j, i * j);
        printf("\n");
    }
    return 0;
}
```

실행 결과:

```
2*1=2  2*2=4  2*3=6
3*1=3  3*2=6  3*3=9
4*1=4  4*2=8  4*3=12
```

---

## 8. 함수

함수는 기능을 묶어 이름을 붙인 코드 블록이다. 중복을 줄이고 프로그램을 작은 단위로 나눈다. 사용하기 전에 컴파일러가 함수의 모양을 알아야 하므로, `main` 위에 **함수 원형(프로토타입)**을 선언하거나 정의 자체를 위에 둔다.

```c
#include <stdio.h>

int add(int a, int b);          // 함수 원형 (선언)

int main(void)
{
    int result = add(3, 4);     // 함수 호출
    printf("3 + 4 = %d\n", result);
    return 0;
}

int add(int a, int b)           // 함수 정의
{
    return a + b;               // 결과를 호출한 곳으로 반환
}
```

출력: `3 + 4 = 7`

### 값에 의한 전달 (call by value)

C는 함수에 인자를 넘길 때 **값을 복사**한다. 그래서 함수 안에서 매개변수를 바꿔도 원래 변수는 바뀌지 않는다.

```c
#include <stdio.h>

void tryChange(int x) { x = 100; }   // 복사본만 바뀜

int main(void)
{
    int a = 1;
    tryChange(a);
    printf("a = %d\n", a);   // 1 (그대로!)
    return 0;
}
```

출력: `a = 1`

함수 밖의 변수를 진짜로 바꾸려면 **주소를 넘겨야** 한다. 이것이 포인터를 배워야 하는 핵심 이유 중 하나다(11장에서 다룬다).

### 지역 변수와 전역 변수, 그리고 static

함수 안에서 선언한 변수는 **지역 변수**로 그 함수에서만 살아 있다. 함수 밖에 선언하면 **전역 변수**로 어디서나 접근 가능하다. `static` 지역 변수는 함수가 끝나도 값이 유지된다.

```c
#include <stdio.h>

void counter(void)
{
    static int count = 0;   // 한 번만 초기화, 호출 사이에 값 유지
    count++;
    printf("호출 횟수: %d\n", count);
}

int main(void)
{
    counter();   // 1
    counter();   // 2
    counter();   // 3
    return 0;
}
```

실행 결과:

```
호출 횟수: 1
호출 횟수: 2
호출 횟수: 3
```

### 기억 클래스 (storage class) 4종

변수가 **언제 만들어지고(수명)**, **어디서 보이는지(범위)**, **어디에 저장되는지**를 결정하는 것이 기억 클래스다. C에는 `auto`, `register`, `static`, `extern` 네 가지가 있다.

| 기억 클래스 | 키워드 | 저장 위치 | 수명(생존 기간) | 범위(보이는 곳) | 기본 초기값 |
| --- | --- | --- | --- | --- | --- |
| 자동 | `auto` | 스택 | 블록 진입~탈출 | 그 블록 안 | 쓰레기 값 |
| 레지스터 | `register` | CPU 레지스터(권고) | 블록 진입~탈출 | 그 블록 안 | 쓰레기 값 |
| 정적 | `static` | 데이터 영역 | 프로그램 시작~종료 | 선언된 곳(지역/파일) | 0 |
| 외부 | `extern` | 데이터 영역 | 프로그램 시작~종료 | 모든 파일 | 0 |

- **`auto`**: 함수/블록 안에서 선언하는 일반 지역 변수의 기본값이다. `int x;`는 사실 `auto int x;`와 같아 거의 쓰지 않는다. 블록을 벗어나면 사라진다.
- **`register`**: 자주 쓰는 변수를 가능하면 CPU 레지스터에 두라는 **권고**다(컴파일러가 무시할 수 있음). 레지스터에 있을 수 있어 `&`로 주소를 못 구한다. 요즘 컴파일러는 최적화를 잘해서 거의 쓰지 않는다.
- **`static`**: 지역에 쓰면 함수 호출 사이에 값이 유지되고(위 `counter` 예제), 전역(파일 범위)에 쓰면 그 변수를 **그 파일 안에서만** 보이게 가둔다(다른 파일에서 못 봄).
- **`extern`**: 변수가 **다른 파일(또는 뒤쪽)에 정의되어 있음**을 알리는 선언이다. 실제 메모리는 만들지 않고 "이런 전역 변수가 어딘가 있다"고 컴파일러에 알려, 여러 파일이 같은 전역 변수를 공유하게 한다.

`extern`으로 다른 파일의 전역 변수를 참조하는 예다. `counter.c`에 정의된 전역 변수를 `main.c`가 `extern`으로 끌어와 함께 쓴다.

`counter.c` (변수의 실제 정의):

```c
int g_count = 0;          // 전역 변수의 실제 정의 (메모리가 여기 생김)

void increase(void)
{
    g_count++;            // 같은 전역 변수를 증가
}
```

`main.c` (extern으로 참조):

```c
#include <stdio.h>

extern int g_count;       // "g_count는 다른 파일에 있다"는 선언만 (정의 아님)
void increase(void);      // 함수 원형

int main(void)
{
    increase();
    increase();
    increase();
    printf("g_count = %d\n", g_count);   // 3
    return 0;
}
```

컴파일과 실행:

```
gcc main.c counter.c -o counter
./counter
```

출력: `g_count = 3`

`main.c`의 `extern int g_count;`는 메모리를 새로 만들지 않고, `counter.c`에 정의된 같은 변수를 가리킨다. 그래서 `increase()`가 올린 값을 `main`에서 그대로 읽을 수 있다. 만약 `counter.c`에서 `g_count`를 `static int g_count = 0;`로 정의했다면 파일 밖에서 보이지 않아 `main.c`의 `extern` 참조는 링크 오류가 난다.

---

## 9. 배열

같은 자료형의 값 여러 개를 하나의 이름으로 묶은 것이 배열이다. 인덱스는 **0부터** 시작한다.

```c
#include <stdio.h>

int main(void)
{
    int score[5] = {90, 85, 70, 95, 60};   // 크기 5의 정수 배열
    int sum = 0;

    for (int i = 0; i < 5; i++)
        sum += score[i];

    printf("총점: %d\n", sum);
    printf("평균: %.1f\n", (double)sum / 5);
    printf("첫 점수: %d, 마지막: %d\n", score[0], score[4]);
    return 0;
}
```

실행 결과:

```
총점: 400
평균: 80.0
첫 점수: 90, 마지막: 60
```

주의: C는 배열 범위를 검사하지 않는다. 크기 5 배열에서 `score[5]`나 `score[10]`에 접근해도 컴파일은 되지만 엉뚱한 메모리를 건드려 버그가 생긴다(off-by-one 오류). 반복 조건은 `i < 5`처럼 정확히 맞춘다.

### 2차원 배열

행과 열을 가진 표 형태의 데이터다.

```c
#include <stdio.h>

int main(void)
{
    int matrix[2][3] = {
        {1, 2, 3},
        {4, 5, 6}
    };
    for (int i = 0; i < 2; i++) {
        for (int j = 0; j < 3; j++)
            printf("%d ", matrix[i][j]);
        printf("\n");
    }
    return 0;
}
```

실행 결과:

```
1 2 3
4 5 6
```

---

## 10. 문자열

C에는 별도의 문자열 타입이 없다. 문자열은 **마지막에 널 문자 `'\0'`가 붙은 char 배열**이다. 이 널 문자가 "여기서 문자열이 끝났다"는 표시이고, 이를 모르면 문자열 처리가 통째로 막힌다.

```c
#include <stdio.h>
#include <string.h>   // 문자열 함수 모음

int main(void)
{
    char name[20] = "KNOU";   // 자동으로 끝에 '\0'이 붙음 (5바이트 사용)
    printf("문자열: %s\n", name);
    printf("길이: %zu\n", strlen(name));   // '\0' 제외한 길이 = 4

    char a[20] = "Hello";
    char b[] = "World";
    strcat(a, b);                  // a 뒤에 b를 이어붙임
    printf("연결: %s\n", a);       // HelloWorld

    if (strcmp(name, "KNOU") == 0)   // 같으면 0 반환
        printf("이름이 KNOU와 같음\n");
    return 0;
}
```

실행 결과:

```
문자열: KNOU
길이: 4
연결: HelloWorld
이름이 KNOU와 같음
```

자주 쓰는 `<string.h>` 함수:

- `strlen(s)` - 길이(널 제외)
- `strcpy(dst, src)` - 복사
- `strcat(dst, src)` - 이어붙이기
- `strcmp(a, b)` - 비교(같으면 0)

문자열을 비교할 때 `name == "KNOU"`처럼 `==`를 쓰면 안 된다. 이건 내용이 아니라 주소를 비교하는 것이라 항상 의도와 다르게 동작한다. 반드시 `strcmp`를 쓴다.

---

## 11. 포인터 (가장 중요한 단원)

포인터는 **변수의 주소(메모리 위치)를 저장하는 변수**다. C를 진짜로 이해했는지를 가르는 핵심이며, 배열, 문자열, 함수 인자 전달, 동적 메모리, 자료구조가 전부 포인터 위에 세워진다. 천천히, 그림을 그려가며 익히자.

두 가지 연산자가 짝을 이룬다.

- `&변수` - 그 변수의 **주소**를 구한다 (address-of).
- `*포인터` - 그 포인터가 가리키는 곳의 **값**을 구한다 (역참조, dereference).

```c
#include <stdio.h>

int main(void)
{
    int a = 10;
    int *p = &a;      // p는 a의 주소를 저장 (int를 가리키는 포인터)

    printf("a의 값:    %d\n", a);     // 10
    printf("a의 주소:  %p\n", (void*)&a);  // 예: 0x7ffe...
    printf("p가 담은 값(=a의 주소): %p\n", (void*)p);
    printf("*p (p가 가리키는 값): %d\n", *p);   // 10

    *p = 20;          // p가 가리키는 곳(=a)에 20 대입
    printf("a의 값: %d\n", a);   // 20  (a가 바뀌었다!)
    return 0;
}
```

실행 결과(주소 부분은 환경마다 다름):

```
a의 값:    10
a의 주소:  0x7ffeefbff5ac
p가 담은 값(=a의 주소): 0x7ffeefbff5ac
*p (p가 가리키는 값): 10
a의 값: 20
```

`*p = 20` 한 줄로 `a`가 20이 된 것이 핵심이다. `p`는 `a`를 "가리키므로", `p`를 통해 `a`를 간접적으로 바꿀 수 있다.

### 포인터로 함수 밖 변수 바꾸기 (call by reference 흉내)

8장에서 `tryChange`가 원래 변수를 못 바꿨던 문제를 포인터로 해결한다. 두 변수의 값을 맞바꾸는 `swap`이 대표 예제다.

```c
#include <stdio.h>

void swap(int *x, int *y)   // 주소를 받음
{
    int temp = *x;          // x가 가리키는 값을 임시 저장
    *x = *y;                // x가 가리키는 곳에 y의 값
    *y = temp;
}

int main(void)
{
    int a = 1, b = 2;
    swap(&a, &b);           // 주소를 넘김
    printf("a=%d, b=%d\n", a, b);   // a=2, b=1
    return 0;
}
```

출력: `a=2, b=1`

주소를 넘겼기 때문에 함수가 원래 변수 `a`, `b`를 직접 고칠 수 있었다. `scanf`에 `&`를 붙이는 이유도 바로 이것이다(scanf가 우리 변수에 값을 써넣어야 하므로 주소가 필요하다).

### NULL 포인터와 주의점

아무것도 가리키지 않는 포인터는 `NULL`로 초기화한다. 초기화하지 않은 포인터(쓰레기 주소)를 역참조하거나 `NULL`을 역참조하면 프로그램이 죽는다(segmentation fault). 포인터는 항상 유효한 곳을 가리키는지 확인하고 쓴다.

```c
int *p = NULL;          // 안전한 초기값
if (p != NULL) *p = 5;  // NULL 검사 후 사용
```

### 이중 포인터 (int **)

포인터도 변수이므로 그 주소를 담는 포인터가 있을 수 있다. 이것이 **이중 포인터**(포인터의 포인터)다. `int **pp`는 "`int`를 가리키는 포인터를 가리키는 포인터"다. 함수 안에서 호출자의 포인터 자체를 바꾸고 싶을 때(예: 동적 할당 결과를 인자로 돌려줄 때) 쓴다.

```c
#include <stdio.h>

int main(void)
{
    int a = 10;
    int *p = &a;       // p는 a를 가리킴
    int **pp = &p;     // pp는 p를 가리킴 (포인터의 주소)

    printf("a    = %d\n", a);       // 10
    printf("*p   = %d\n", *p);      // 10  (p가 가리키는 값)
    printf("**pp = %d\n", **pp);    // 10  (pp -> p -> a)

    **pp = 20;         // pp를 두 번 역참조하면 결국 a에 도달
    printf("a    = %d\n", a);       // 20  (a가 바뀜)

    return 0;
}
```

실행 결과:

```
a    = 10
*p   = 10
**pp = 10
a    = 20
```

`*pp`는 `p`(포인터)를, `**pp`는 `a`(실제 값)를 가리킨다. 역참조를 한 단계씩 따라가며 머릿속으로 화살표를 그리면 헷갈리지 않는다.

### 포인터 배열 (char *arr[])

포인터를 원소로 갖는 배열이다. 특히 `char *arr[]`은 **문자열 여러 개를 묶는** 가장 흔한 방법이다. 각 원소가 문자열(문자 배열)의 첫 주소를 담는다. 길이가 제각각인 문자열도 깔끔하게 다룰 수 있다.

```c
#include <stdio.h>

int main(void)
{
    // 각 원소는 문자열 리터럴의 시작 주소를 담는 포인터
    char *fruits[] = {"apple", "banana", "cherry"};
    int n = sizeof(fruits) / sizeof(fruits[0]);   // 원소 개수 = 3

    for (int i = 0; i < n; i++)
        printf("%d: %s\n", i, fruits[i]);

    return 0;
}
```

실행 결과:

```
0: apple
1: banana
2: cherry
```

`fruits[i]`는 `char *`(문자열의 시작 주소)이므로 `%s`로 바로 출력된다. `main(int argc, char *argv[])`의 `argv`가 바로 이 포인터 배열 형태로, 명령행 인자들을 받는다.

---

## 12. 포인터와 배열

배열 이름은 사실 **첫 원소의 주소**처럼 동작한다. 그래서 `arr`와 `&arr[0]`은 같은 주소다. 포인터에 정수를 더하면 자료형 크기만큼 주소가 움직인다(포인터 산술).

```c
#include <stdio.h>

int main(void)
{
    int arr[3] = {10, 20, 30};
    int *p = arr;        // p = &arr[0] 과 같음

    printf("arr[0] = %d\n", *p);        // 10
    printf("arr[1] = %d\n", *(p + 1));  // 20  (다음 int로 이동)
    printf("arr[2] = %d\n", *(p + 2));  // 30

    // 인덱스 표기와 포인터 표기는 동일
    for (int i = 0; i < 3; i++)
        printf("%d ", p[i]);   // p[i] == *(p+i) == arr[i]
    printf("\n");
    return 0;
}
```

실행 결과:

```
arr[0] = 10
arr[1] = 20
arr[2] = 30
10 20 30
```

`*(p + 1)`이 두 번째 원소를 가리키는 이유는, `p`가 `int*`라서 `+1`이 "4바이트(int 한 칸) 뒤"를 의미하기 때문이다. 이 덕분에 배열을 함수에 넘기면 사실 첫 원소의 주소가 넘어가고, 함수 안에서 원본 배열을 수정할 수 있다.

```c
#include <stdio.h>

void doubleAll(int *a, int n)   // 배열 = 포인터로 받음
{
    for (int i = 0; i < n; i++)
        a[i] *= 2;              // 원본을 직접 수정
}

int main(void)
{
    int data[4] = {1, 2, 3, 4};
    doubleAll(data, 4);
    for (int i = 0; i < 4; i++) printf("%d ", data[i]);   // 2 4 6 8
    printf("\n");
    return 0;
}
```

출력: `2 4 6 8`

---

## 13. 구조체와 공용체

### 구조체 (struct)

서로 다른 자료형의 데이터를 하나의 묶음으로 만든다. 학생(이름+나이+학점)처럼 관련 데이터를 한 덩어리로 다룰 때 쓴다.

```c
#include <stdio.h>
#include <string.h>

struct Student {
    char name[20];
    int  age;
    double gpa;
};

int main(void)
{
    struct Student s1;
    strcpy(s1.name, "홍길동");   // 멤버 접근은 점(.)
    s1.age = 20;
    s1.gpa = 4.2;

    printf("이름: %s\n", s1.name);
    printf("나이: %d\n", s1.age);
    printf("학점: %.1f\n", s1.gpa);

    // 선언과 동시에 초기화도 가능
    struct Student s2 = {"이몽룡", 22, 3.8};
    printf("%s (%d): %.1f\n", s2.name, s2.age, s2.gpa);
    return 0;
}
```

실행 결과:

```
이름: 홍길동
나이: 20
학점: 4.2
이몽룡 (22): 3.8
```

### typedef로 이름 줄이기

매번 `struct Student`라고 쓰기 번거로우면 `typedef`로 별명을 만든다.

```c
typedef struct {
    char name[20];
    int  age;
} Person;          // 이제 Person으로 쓸 수 있음

Person p = {"춘향", 18};
```

### 구조체 포인터와 화살표 연산자

구조체 포인터에서 멤버에 접근할 때는 `(*p).age` 대신 화살표 `p->age`를 쓴다(같은 의미, 화살표가 더 깔끔). 함수에 구조체를 넘길 때 통째로 복사하면 느리므로 보통 포인터로 넘긴다.

```c
#include <stdio.h>

typedef struct { int x, y; } Point;

void move(Point *p, int dx, int dy)
{
    p->x += dx;     // (*p).x += dx 와 동일
    p->y += dy;
}

int main(void)
{
    Point pt = {1, 1};
    move(&pt, 3, 4);
    printf("(%d, %d)\n", pt.x, pt.y);   // (4, 5)
    return 0;
}
```

출력: `(4, 5)`

### 구조체 배열 순회와 정렬

구조체도 배열로 묶을 수 있다. 학생 여러 명을 `struct Student arr[N]`로 모아 두고, 반복문으로 순회하거나 학점 순으로 정렬하는 것이 전형적인 활용이다. 아래는 학점(gpa) 내림차순으로 버블 정렬하는 예제다.

```c
#include <stdio.h>
#include <string.h>

struct Student {
    char name[20];
    int  age;
    double gpa;
};

int main(void)
{
    struct Student arr[3] = {
        {"홍길동", 20, 3.5},
        {"이몽룡", 22, 4.2},
        {"성춘향", 21, 3.9}
    };
    int n = sizeof(arr) / sizeof(arr[0]);   // 학생 수 = 3

    // gpa 내림차순 버블 정렬 (구조체 통째로 교환)
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j].gpa < arr[j + 1].gpa) {
                struct Student tmp = arr[j];   // 구조체는 = 로 통째 복사 가능
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
            }
        }
    }

    printf("=== 학점 높은 순 ===\n");
    for (int i = 0; i < n; i++)               // 순회하며 출력
        printf("%d위: %s (%.1f)\n", i + 1, arr[i].name, arr[i].gpa);

    return 0;
}
```

실행 결과:

```
=== 학점 높은 순 ===
1위: 이몽룡 (4.2)
2위: 성춘향 (3.9)
3위: 홍길동 (3.5)
```

핵심은 `struct Student tmp = arr[j];`처럼 구조체를 `=` 한 번으로 통째 복사·교환할 수 있다는 점이다(멤버를 일일이 옮길 필요 없음). 원소 개수는 `sizeof(arr) / sizeof(arr[0])`로 구하면 배열 크기가 바뀌어도 코드를 안 고쳐도 된다.

### 공용체 (union)

구조체와 문법은 같지만, 모든 멤버가 **같은 메모리**를 공유한다. 한 번에 하나의 멤버만 의미가 있다. 메모리를 아끼거나 같은 데이터를 다른 형으로 해석할 때 쓴다.

```c
#include <stdio.h>

union Data {
    int   i;
    float f;
};

int main(void)
{
    union Data d;
    d.i = 65;
    printf("정수로: %d\n", d.i);   // 65
    d.f = 3.14f;                    // 같은 공간에 덮어씀
    printf("실수로: %.2f\n", d.f);  // 3.14
    printf("크기: %zu\n", sizeof(d)); // 가장 큰 멤버 크기 = 4
    return 0;
}
```

실행 결과:

```
정수로: 65
실수로: 3.14
크기: 4
```

---

## 14. 동적 메모리 할당 (malloc / free)

지금까지의 배열은 크기를 컴파일 시점에 정해야 했다. 실행 중에 필요한 만큼 메모리를 얻으려면 **동적 할당**을 쓴다. `<stdlib.h>`의 `malloc`으로 힙(heap)에서 메모리를 빌리고, 다 쓰면 반드시 `free`로 돌려줘야 한다(반납 안 하면 메모리 누수).

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int n;
    printf("원소 개수: ");
    scanf("%d", &n);

    // int n개 분량의 메모리를 동적 할당
    int *arr = (int *)malloc(n * sizeof(int));
    if (arr == NULL) {            // 할당 실패 검사 필수
        printf("메모리 부족\n");
        return 1;
    }

    for (int i = 0; i < n; i++)
        arr[i] = (i + 1) * 10;    // 포인터를 배열처럼 사용

    int sum = 0;
    for (int i = 0; i < n; i++)
        sum += arr[i];
    printf("합: %d\n", sum);

    free(arr);                    // 메모리 반납 (필수!)
    arr = NULL;                   // 댕글링 포인터 방지
    return 0;
}
```

입력 `4`일 때 실행 결과:

```
원소 개수: 4
합: 100
```

(10+20+30+40 = 100)

기억할 규칙:

- `malloc`은 성공하면 빌린 메모리의 시작 주소를, 실패하면 `NULL`을 돌려준다. 항상 `NULL` 검사를 한다.
- `malloc(n * sizeof(int))`처럼 "개수 x 한 개 크기"로 계산한다.
- 0으로 초기화된 메모리가 필요하면 `calloc`, 크기를 늘리려면 `realloc`을 쓴다.
- `malloc`한 것은 정확히 한 번 `free`한다. 안 하면 누수, 두 번 하면 충돌(double free).

### calloc 과 realloc

`malloc`이 준 메모리에는 쓰레기 값이 들어 있다. 처음부터 **0으로 채워진** 메모리가 필요하면 `calloc(개수, 한_개_크기)`를 쓴다. 이미 할당한 블록의 크기를 **나중에 늘리거나 줄이려면** `realloc(기존포인터, 새_바이트크기)`를 쓴다. `realloc`은 기존 내용을 보존한 채 새 크기의 블록 주소를 돌려준다(자리가 모자라면 새 공간으로 옮긴 뒤 옛 공간을 알아서 반납한다).

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    // 1) calloc: int 3개를 0으로 초기화하여 할당
    int *arr = (int *)calloc(3, sizeof(int));
    if (arr == NULL) { printf("할당 실패\n"); return 1; }

    printf("calloc 직후: ");
    for (int i = 0; i < 3; i++)
        printf("%d ", arr[i]);   // 전부 0
    printf("\n");

    for (int i = 0; i < 3; i++)
        arr[i] = (i + 1) * 10;   // 10, 20, 30

    // 2) realloc: 3개 -> 5개로 확장 (기존 값 보존)
    int *tmp = (int *)realloc(arr, 5 * sizeof(int));
    if (tmp == NULL) { free(arr); return 1; }  // 실패 시 원본은 유효
    arr = tmp;                                  // 성공하면 새 주소로 교체

    arr[3] = 40;     // 늘어난 칸에 값 채우기
    arr[4] = 50;

    printf("realloc 후 : ");
    for (int i = 0; i < 5; i++)
        printf("%d ", arr[i]);   // 10 20 30 40 50
    printf("\n");

    free(arr);       // 마지막에 한 번만 반납
    arr = NULL;
    return 0;
}
```

실행 결과:

```
calloc 직후: 0 0 0
realloc 후 : 10 20 30 40 50
```

주의: `realloc`의 결과를 `arr = realloc(arr, ...)`처럼 같은 변수에 바로 받으면, 실패해 `NULL`이 돌아왔을 때 원본 주소를 잃어버려 누수가 난다. 위 예제처럼 임시 변수 `tmp`로 먼저 받아 성공을 확인한 뒤 교체하는 것이 안전하다.

---

## 15. 파일 입출력

프로그램이 끝나도 데이터를 남기려면 파일에 읽고 쓴다. `<stdio.h>`의 `FILE *` 포인터로 파일을 다룬다. 순서는 항상 **열기(fopen) -> 읽기/쓰기 -> 닫기(fclose)**다.

파일 모드: `"r"` 읽기, `"w"` 쓰기(기존 내용 삭제), `"a"` 이어쓰기.

```c
#include <stdio.h>

int main(void)
{
    // 1) 파일에 쓰기
    FILE *fp = fopen("score.txt", "w");
    if (fp == NULL) {                 // 열기 실패 검사 필수
        printf("파일을 열 수 없음\n");
        return 1;
    }
    fprintf(fp, "홍길동 90\n");        // printf처럼 파일에 출력
    fprintf(fp, "이몽룡 85\n");
    fclose(fp);                       // 닫기 (버퍼 비우기 + 자원 반납)

    // 2) 파일에서 읽기
    fp = fopen("score.txt", "r");
    if (fp == NULL) return 1;

    char name[20];
    int  score;
    while (fscanf(fp, "%s %d", name, &score) == 2) {  // 2개 읽으면 성공
        printf("%s -> %d\n", name, score);
    }
    fclose(fp);
    return 0;
}
```

실행 결과(화면):

```
홍길동 -> 90
이몽룡 -> 85
```

그리고 같은 폴더에 `score.txt` 파일이 생기고 그 안에는 다음이 들어 있다.

```
홍길동 90
이몽룡 85
```

핵심 함수:

- `fopen(파일명, 모드)` / `fclose(fp)` - 열기 / 닫기
- `fprintf` / `fscanf` - 서식 기반 쓰기 / 읽기
- `fgets(buf, size, fp)` - 한 줄 읽기(공백 포함, 안전)
- `feof(fp)` - 파일 끝 확인

`fopen`이 실패하면 `NULL`을 돌려주므로 항상 검사한다. `fclose`를 빠뜨리면 쓴 내용이 디스크에 안 남을 수 있다(버퍼에만 있고 비워지지 않음).

### 랜덤(이진) 파일 처리

위 예제는 사람이 읽을 수 있는 **텍스트** 파일이다. 반면 구조체나 배열을 메모리에 있는 바이트 그대로 저장하면 **이진(binary) 파일**이 된다. 파일 모드 뒤에 `b`를 붙여(`"wb"`, `"rb"`) 연다. 이진 파일은 한 레코드의 크기가 고정이므로, 원하는 위치로 곧장 건너뛰어 읽고 쓰는 **랜덤 접근**이 가능하다.

핵심 함수:

- `fwrite(주소, 한_개_크기, 개수, fp)` - 메모리의 바이트를 그대로 파일에 쓴다.
- `fread(주소, 한_개_크기, 개수, fp)` - 파일의 바이트를 그대로 메모리로 읽는다.
- `fseek(fp, 오프셋, 기준)` - 파일 안의 읽기/쓰기 위치를 옮긴다. 기준은 `SEEK_SET`(처음), `SEEK_CUR`(현재), `SEEK_END`(끝).
- `ftell(fp)` - 현재 위치를 바이트 단위로 알려준다.
- `rewind(fp)` - 위치를 파일 맨 앞으로 되돌린다(`fseek(fp, 0, SEEK_SET)`과 같음).

```c
#include <stdio.h>
#include <string.h>

struct Student {
    char name[20];
    int  age;
    double gpa;
};

int main(void)
{
    struct Student list[3] = {
        {"홍길동", 20, 3.5},
        {"이몽룡", 22, 4.2},
        {"성춘향", 21, 3.9}
    };

    // 1) 이진 모드로 구조체 배열 전체를 한 번에 기록
    FILE *fp = fopen("students.dat", "wb");
    if (fp == NULL) { printf("파일 열기 실패\n"); return 1; }
    fwrite(list, sizeof(struct Student), 3, fp);  // 3개 레코드 기록
    fclose(fp);

    // 2) 다시 열어 랜덤 접근으로 2번째(인덱스 1) 레코드만 읽기
    fp = fopen("students.dat", "rb");
    if (fp == NULL) return 1;

    // 레코드 1개 크기 x 1 만큼 앞에서 건너뛰어 두 번째로 이동
    fseek(fp, 1 * sizeof(struct Student), SEEK_SET);
    printf("현재 위치(바이트): %ld\n", ftell(fp));

    struct Student one;
    fread(&one, sizeof(struct Student), 1, fp);   // 두 번째 레코드 읽기
    printf("2번째 학생: %s (%d, %.1f)\n", one.name, one.age, one.gpa);

    // 3) 맨 앞으로 되돌려 첫 레코드 읽기
    rewind(fp);
    fread(&one, sizeof(struct Student), 1, fp);
    printf("1번째 학생: %s (%d, %.1f)\n", one.name, one.age, one.gpa);

    fclose(fp);
    return 0;
}
```

실행 결과(`현재 위치`는 구조체 크기에 따라 다를 수 있음):

```
현재 위치(바이트): 32
2번째 학생: 이몽룡 (22, 4.2)
1번째 학생: 홍길동 (20, 3.5)
```

이진 파일은 처음부터 순서대로 읽지 않아도, `fseek`으로 "N번째 레코드 = N x 레코드크기" 위치로 곧장 점프할 수 있다는 것이 텍스트 파일과 가장 다른 점이다. 단, 이진 파일은 메모리 표현을 그대로 담으므로 구조체의 메모리 정렬(padding)이나 시스템(엔디언, 자료형 크기)이 다르면 호환되지 않는다는 점을 기억하자.

---

## 16. 전처리기와 매크로

`#`으로 시작하는 줄은 컴파일 전에 전처리기가 처리한다. 대표가 `#include`(헤더 포함)와 `#define`(매크로)이다.

```c
#include <stdio.h>

#define PI 3.141592            // 상수 매크로
#define SQUARE(x) ((x) * (x))  // 함수형 매크로 (괄호 주의!)
#define MAX 100

int main(void)
{
    double r = 2.0;
    printf("원의 넓이: %.2f\n", PI * SQUARE(r));   // 3.14 * 4 = 12.57
    printf("MAX = %d\n", MAX);
    return 0;
}
```

실행 결과:

```
원의 넓이: 12.57
MAX = 100
```

매크로 주의점: `SQUARE(x)`를 `x * x`로만 쓰면 `SQUARE(1+2)`가 `1+2*1+2 = 5`로 잘못 펼쳐진다. 그래서 인자와 전체를 괄호로 감싼다. 조건부 컴파일(`#ifdef`, `#ifndef`, `#endif`)은 헤더 중복 포함을 막는 **인클루드 가드**에 쓰인다.

```c
#ifndef MYHEADER_H     // 아직 정의 안 됐으면
#define MYHEADER_H     // 정의하고
/* ... 헤더 내용 ... */
#endif                 // 두 번째 포함부터는 건너뜀
```

---

## 17. 재귀 함수

함수가 자기 자신을 호출하는 것을 재귀라 한다. 반드시 **종료 조건(base case)**이 있어야 무한 호출을 멈춘다. 팩토리얼과 피보나치가 대표 예제다.

```c
#include <stdio.h>

int factorial(int n)
{
    if (n <= 1) return 1;          // 종료 조건
    return n * factorial(n - 1);   // 자기 자신 호출
}

int main(void)
{
    printf("5! = %d\n", factorial(5));   // 120
    return 0;
}
```

출력: `5! = 120`

`factorial(5)`는 `5 * factorial(4)` = `5 * 4 * factorial(3)` ... `5*4*3*2*1 = 120`으로 풀린다. 재귀는 코드가 간결하지만, 종료 조건을 빠뜨리면 호출이 쌓여 스택 오버플로로 죽는다. 또 피보나치처럼 같은 계산을 중복하면 느리므로, 효율이 중요하면 반복문으로 바꾸기도 한다.

---

## 18. 다중 파일 구성

프로그램이 커지면 소스를 여러 파일로 나눈다. 보통 함수 선언은 헤더(`.h`)에, 정의는 소스(`.c`)에 두고, 다른 파일에서 헤더를 `#include`한다.

`mymath.h` (헤더 - 선언):

```c
#ifndef MYMATH_H
#define MYMATH_H

int add(int a, int b);     // 함수 원형만 선언
int mul(int a, int b);

#endif
```

`mymath.c` (구현):

```c
#include "mymath.h"        // 내 헤더는 따옴표로 포함

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
```

`main.c` (사용):

```c
#include <stdio.h>
#include "mymath.h"        // 선언을 가져와서 사용

int main(void)
{
    printf("3 + 4 = %d\n", add(3, 4));
    printf("3 * 4 = %d\n", mul(3, 4));
    return 0;
}
```

컴파일 명령(두 소스를 함께 컴파일):

```
gcc main.c mymath.c -o program
./program
```

실행 결과:

```
3 + 4 = 7
3 * 4 = 12
```

표준 헤더는 `<stdio.h>`처럼 꺾쇠로, 내가 만든 헤더는 `"mymath.h"`처럼 따옴표로 포함한다. 인클루드 가드(`#ifndef ... #endif`)를 헤더에 두면 같은 헤더가 여러 번 포함돼도 중복 정의 오류가 나지 않는다. 이렇게 나누면 한 파일만 고쳐도 전체를 다시 컴파일할 필요가 줄어 큰 프로젝트 관리가 쉬워진다.

---

## 19. 자주 만나는 오류와 디버깅 팁

C 입문자가 반복해서 겪는 문제들을 미리 알아두면 시간을 크게 아낀다.

- **세미콜론 / 중괄호 누락** - 컴파일 오류 메시지의 줄 번호 바로 위를 의심한다.
- **`=` 와 `==` 혼동** - `if (a = 0)`은 항상 거짓이 되는 버그. 경고를 켜면(`gcc -Wall`) 잡아준다.
- **배열 범위 초과** - 크기 n 배열에서 인덱스 0 ~ n-1만 유효.
- **초기화 안 한 변수/포인터** - 쓰레기 값이 들어 있다. 선언 시 초기화하는 습관.
- **scanf의 `&` 누락** - `scanf("%d", n)` 같은 실수.
- **메모리 누수 / double free** - `malloc`과 `free`를 1:1로 짝지운다.
- **정수 나눗셈 함정** - 실수 평균이 필요하면 형변환.

컴파일할 때 경고를 모두 켜는 것이 가장 좋은 첫 방어선이다.

```
gcc -Wall -Wextra -g program.c -o program
```

`-Wall -Wextra`는 의심스러운 코드를 경고로 알려주고, `-g`는 디버깅 정보를 넣어 `gdb`로 한 줄씩 추적할 수 있게 해준다. 메모리 오류는 `valgrind ./program`으로 누수와 잘못된 접근을 찾을 수 있다.

---

## 무료 학습 자료

- C 언어 코딩 도장 - https://dojang.io/course/view.php?id=2 - 한국어로 된 무료 C언어 강의. 입문부터 포인터/구조체까지 예제 중심으로 매우 친절하다.
- 모두의 코드 (씹어먹는 C 언어) - https://modoocode.com/231 - 포인터와 메모리를 깊이 있게 설명하는 한국어 무료 강좌.
- cppreference (C 언어 레퍼런스) - https://en.cppreference.com/w/c - 표준 라이브러리 함수와 문법의 가장 정확한 영어 레퍼런스.
- Learn-C.org - https://www.learn-c.org/ - 브라우저에서 바로 코드를 실행하며 배우는 인터랙티브 영어 튜토리얼.
- GNU GCC 공식 문서 - https://gcc.gnu.org/onlinedocs/ - GCC 컴파일러 옵션과 동작에 관한 공식 문서.
- Beej's Guide to C Programming - https://beej.us/guide/bgc/ - 무료로 공개된 깊이 있는 영문 C 입문서(PDF/HTML).
- The C Programming Language (위키백과) - https://en.wikipedia.org/wiki/C_(programming_language) - C의 역사와 특징을 정리한 백과 항목.
- 위키독스 - C 언어 (점프 투 C 류 강좌) - https://wikidocs.net/book/2348 - 한국어 무료 전자책 형태의 C 입문 강좌.
- Programiz C Tutorial - https://www.programiz.com/c-programming - 개념별로 깔끔하게 정리되고 온라인 컴파일러가 함께 있는 영어 튜토리얼.
- GeeksforGeeks C Programming - https://www.geeksforgeeks.org/c-programming-language/ - 주제별 예제와 연습문제가 풍부한 영어 학습 사이트.
- Compiler Explorer (godbolt) - https://godbolt.org/ - C 코드가 어떤 어셈블리/오브젝트로 변환되는지 실시간으로 보여주는 도구.
- KNOU 컴퓨터과학과 - https://cs.knou.ac.kr/ - 방송대 컴퓨터과학과 공식 사이트. 담당 교수 강의자료와 공지를 확인할 수 있다.
